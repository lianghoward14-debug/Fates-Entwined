(function(){
  'use strict';

  if(typeof window === 'undefined') return;
  if(window.fateVfxAcceptanceReport) return;

  const VERSION = 1;
  const REQUIRED_RECIPES = [
    'PLAY_CARD',
    'DRAW_CARD',
    'DISCARD_CARD',
    'DESTROY_CARD',
    'FATE_GAIN',
    'FATE_LOSS',
    'CONSOLIDATE',
    'SUPPORTER_ACTIVATE',
    'LANDSCAPE_TRIGGER',
    'TURN_START',
    'TURN_END'
  ];
  const NORMAL_MOTION_RECIPES = ['PLAY_CARD', 'DRAW_CARD', 'DISCARD_CARD', 'CONSOLIDATE'];
  const NOISY_PRIMITIVES = ['particleBurst', 'screenFlash', 'shockwaveRing', 'boardDim', 'spotlight'];
  const REQUIRED_PRIMITIVES = [
    'cardMove',
    'cardLift',
    'cardFlip',
    'cardGlow',
    'cardShake',
    'cardDissolve',
    'cardSummon',
    'cardTrail',
    'shockwaveRing',
    'particleBurst',
    'beam',
    'boardDim',
    'spotlight',
    'screenShake',
    'screenFlash',
    'numberPop',
    'statusIconPop',
    'pilePulse',
    'handFanPulse',
    'soundCue',
    'hitStop'
  ];

  function qsa(sel){
    try { return document.querySelectorAll(sel); }
    catch(e) { return []; }
  }

  function rendererReport(){
    return window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.report === 'function'
      ? window.FateMatchRendererAdapter.report()
      : null;
  }

  function handDragReport(){
    return window.FateMatchHandDragBridge && typeof window.FateMatchHandDragBridge.report === 'function'
      ? window.FateMatchHandDragBridge.report()
      : null;
  }

  function vfxReport(){
    return window.FateVfxDirector && typeof window.FateVfxDirector.report === 'function'
      ? window.FateVfxDirector.report()
      : null;
  }

  function bridgeReport(){
    return window.FateVfxEventBridge && typeof window.FateVfxEventBridge.report === 'function'
      ? window.FateVfxEventBridge.report()
      : null;
  }

  function bridgeApiReport(){
    const bridge = window.FateVfxEventBridge || {};
    const required = ['onAcceptedGameEvent', 'onLocalIntent', 'onPromptCreated', 'onPromptResolved', 'onStateDiff'];
    const missing = required.filter(function(name){ return typeof bridge[name] !== 'function'; });
    return {
      available:missing.length === 0,
      required,
      missing
    };
  }

  function primitiveReport(){
    return window.FateVfxPrimitives && typeof window.FateVfxPrimitives.report === 'function'
      ? window.FateVfxPrimitives.report()
      : null;
  }

  function hasLayer(id){
    return !!document.getElementById(id);
  }

  function recipesOwned(){
    const recipes = window.FateVfxRecipes;
    const missing = REQUIRED_RECIPES.filter(function(name){
      return !(recipes && typeof recipes.has === 'function' && recipes.has(name));
    });
    return {
      missing,
      owns:missing.length === 0
    };
  }

  function recipeKinds(){
    return window.FateVfxRecipes && typeof window.FateVfxRecipes.describe === 'function'
      ? window.FateVfxRecipes.describe()
      : {};
  }

  function noisyNormalRecipes(kinds){
    const out = [];
    NORMAL_MOTION_RECIPES.forEach(function(name){
      const list = Array.isArray(kinds[name]) ? kinds[name] : [];
      const noisy = list.filter(function(kind){ return NOISY_PRIMITIVES.indexOf(kind) >= 0; });
      if(noisy.length) out.push({recipe:name, noisy:noisy});
    });
    return out;
  }

  function acceptanceReport(){
    const renderer = rendererReport();
    const drag = handDragReport();
    const vfx = vfxReport();
    const bridge = bridgeReport();
    const bridgeApi = bridgeApiReport();
    const primitives = primitiveReport();
    const recipe = recipesOwned();
    const kinds = recipeKinds();
    const noisyRecipes = noisyNormalRecipes(kinds);
    const domGhostCards = qsa('.fate-v2-motion-card, #fate-v2-drag-ghost, .fate-v2-canvas-drag-ghost').length;
    const legacyLiveVisuals = qsa('.placement-anim-ghost, .draw-fly-card, .guerilla-transfer-fly, .maria-discard-badge, .aff-change-overlay, .effect-activation-aura, .block-overlay, .effect-blocked-flash').length;
    const layers = {
      background:hasLayer('fate-match-v2-background-canvas'),
      cardBase:hasLayer('fate-match-v2-canvas'),
      effects:hasLayer('fate-match-v2-effect-canvas'),
      particles:hasLayer('fate-match-v2-particle-canvas'),
      ui:hasLayer('fate-match-v2-ui-canvas'),
      hover:hasLayer('fate-match-v2-hover-canvas')
    };
    const motionFx = window.FateV2CardMotionFx && typeof window.FateV2CardMotionFx.report === 'function'
      ? window.FateV2CardMotionFx.report()
      : {usesDomGhosts:!!window.FateV2CardMotionFxUsesDomGhosts};
    const pool = window.FateVfxParticlePool && typeof window.FateVfxParticlePool.report === 'function'
      ? window.FateVfxParticlePool.report()
      : null;
    const blockers = [];
    if(!vfx || !vfx.available) blockers.push('vfx-director-unavailable');
    if(!bridge || !bridge.available) blockers.push('vfx-event-bridge-unavailable');
    if(!bridgeApi.available) blockers.push('vfx-event-bridge-api-missing:' + bridgeApi.missing.join(','));
    if(!primitives || !primitives.pass) blockers.push('missing-primitives:' + ((primitives && primitives.missing || REQUIRED_PRIMITIVES).join(',')));
    if(!recipe.owns) blockers.push('missing-recipes:' + recipe.missing.join(','));
    if(domGhostCards !== 0) blockers.push('dom-ghost-cards-active');
    if(legacyLiveVisuals !== 0) blockers.push('legacy-live-visual-dom-active');
    if(motionFx.usesDomGhosts) blockers.push('motion-fx-uses-dom-ghosts');
    if(!motionFx.ownsPlacementFromHand) blockers.push('motion-fx-placement-from-hand-missing');
    if(!motionFx.ownsDrawFromPile) blockers.push('motion-fx-draw-from-pile-missing');
    if(!motionFx.ownsDiscard) blockers.push('motion-fx-discard-missing');
    if(!motionFx.ownsFlip) blockers.push('motion-fx-flip-missing');
    if(!motionFx.ownsConsolidation) blockers.push('motion-fx-consolidation-missing');
    if(!motionFx.usesHitMapRects) blockers.push('motion-fx-hit-map-rects-missing');
    if(!drag || !drag.usesHitMap) blockers.push('hand-drag-not-hit-map-owned');
    if(drag && drag.usesDomHand) blockers.push('hand-drag-uses-dom-hand');
    if(!layers.effects) blockers.push('effects-layer-missing');
    if(!layers.particles) blockers.push('particle-layer-missing');
    if(!layers.ui) blockers.push('ui-layer-missing');
    if(vfx && !vfx.mode) blockers.push('vfx-mode-report-missing');
    if(vfx && (!vfx.capabilities || !vfx.capabilities.lowEffectsToggle)) blockers.push('low-effects-toggle-missing');
    if(vfx && (!vfx.capabilities || !vfx.capabilities.reducedMotionToggle)) blockers.push('reduced-motion-toggle-missing');
    if(!pool || !(Number(pool.maxActiveParticlesLow) > 0 && Number(pool.maxActiveParticlesLow) < Number(pool.maxActiveParticles))) blockers.push('particle-low-effects-budget-missing');
    if(vfx && vfx.ownership && vfx.ownership.usesDomMotionFallback) blockers.push('dom-motion-fallback-active');
    if(vfx && vfx.ownership && vfx.ownership.mirrorsToAnimationTimeline) blockers.push('vfx-mirrors-to-old-animation-timeline');
    if(renderer && String(renderer.lastDirtySource || '').toLowerCase().indexOf('vfx') >= 0 && renderer.lastVfxLayerOnly !== true) blockers.push('latest-vfx-frame-used-full-scene-path');
    if(noisyRecipes.length) blockers.push('normal-recipes-use-heavy-effects:' + noisyRecipes.map(function(item){ return item.recipe; }).join(','));

    return {
      available:true,
      version:VERSION,
      pass:blockers.length === 0,
      blockers,
      domGhostCards,
      legacyLiveVisuals,
      directorOwnsMotion:!!vfx,
      ownsConsolidation:recipe.missing.indexOf('CONSOLIDATE') < 0,
      ownsPlayCard:recipe.missing.indexOf('PLAY_CARD') < 0,
      ownsDrawCard:recipe.missing.indexOf('DRAW_CARD') < 0,
      ownsDiscard:recipe.missing.indexOf('DISCARD_CARD') < 0,
      ownsDestroy:recipe.missing.indexOf('DESTROY_CARD') < 0,
      ownsPlacementFromHand:!!motionFx.ownsPlacementFromHand,
      ownsFateChange:recipe.missing.indexOf('FATE_GAIN') < 0 && recipe.missing.indexOf('FATE_LOSS') < 0,
      handDragUsesHitMap:!!(drag && drag.usesHitMap),
      handDragUsesDom:!!(drag && drag.usesDomHand),
      layers,
      recipeKinds:kinds,
      noisyNormalRecipes:noisyRecipes,
      lastLayerSmoke,
      mode:vfx ? vfx.mode : null,
      capabilities:vfx ? vfx.capabilities : null,
      particlePool:pool,
      renderer:{
        available:!!(renderer && renderer.available),
        ownsBoard:!!(renderer && renderer.ownsBoard),
        ownsHand:!!(renderer && renderer.ownsHand),
        ownsOpponentHand:!!(renderer && renderer.ownsOpponentHand),
        ownsPiles:!!(renderer && renderer.ownsPiles),
        layerCanvases:renderer && (renderer.layerCanvases || renderer.layers),
        vfxOnlyDraws:renderer && renderer.vfxOnlyDraws || 0,
        vfxFullSceneFallbacks:renderer && renderer.vfxFullSceneFallbacks || 0,
        lastVfxLayerOnly:!!(renderer && renderer.lastVfxLayerOnly),
        lastDirtySource:renderer && renderer.lastDirtySource || ''
      },
      vfx,
      primitives,
      eventBridge:bridge,
      eventBridgeApi:bridgeApi,
      motionFx,
      requiredRecipes:REQUIRED_RECIPES.slice(),
      requiredPrimitives:REQUIRED_PRIMITIVES.slice(),
      missingRecipes:recipe.missing
    };
  }

  function perfMatrix(){
    const renderer = rendererReport() || {};
    const vfx = vfxReport() || {};
    const texture = window.FateCardTextureCache && typeof window.FateCardTextureCache.report === 'function'
      ? window.FateCardTextureCache.report()
      : null;
    const scenarios = [
      'idle',
      'hover only',
      'play card',
      'draw card',
      'discard card',
      'destroy card',
      'fate gain/loss',
      'consolidate 2 tributes',
      'consolidate 4 tributes',
      'supporter activate',
      'landscape trigger',
      'turn start/end',
      '54-card board with VFX',
      'mobile DPR test',
      'low-effects mode',
      'reduced-motion mode'
    ];
    return {
      available:true,
      version:VERSION,
      pass:acceptanceReport().pass,
      scenarios:scenarios.map(function(name){
        return {
          name,
          fps:renderer.fps || 0,
          avgFrameMs:renderer.avgMs || 0,
          maxFrameMs:renderer.maxMs || 0,
          vfxMs:vfx.performance ? vfx.performance.avgVfxMs : 0,
          particleMs:vfx.performance ? vfx.performance.lastParticleMs : 0,
          activeEffects:vfx.active ? vfx.active.primitives : 0,
          activeParticles:vfx.active ? vfx.active.particles : 0,
          domGhosts:vfx.ownership ? vfx.ownership.domGhostsActive : 0,
          fullRedraws:renderer.fullSceneRedraws || 0,
          vfxOnlyDraws:renderer.vfxOnlyDraws || 0,
          vfxFullSceneFallbacks:renderer.vfxFullSceneFallbacks || 0,
          lastVfxLayerOnly:!!renderer.lastVfxLayerOnly,
          layerRedraws:{
            background:renderer.backgroundLayerRedraws || 0,
            card:renderer.cardLayerRedraws || 0,
            effects:renderer.effectLayerRedraws || 0,
            particles:renderer.particleLayerRedraws || 0,
            ui:renderer.uiLayerRedraws || 0
          },
          textureCacheHitRate:texture && texture.baseRequests ? Math.round((texture.baseHits / texture.baseRequests) * 1000) / 10 : null,
          droppedLowPriorityEffects:vfx.performance ? vfx.performance.skippedLowPriorityEffects : 0
        };
      }),
      renderer,
      vfx,
      textureCache:texture
    };
  }

  let lastLayerSmoke = null;

  function waitFrame(){
    return new Promise(function(resolve){
      requestAnimationFrame(function(){ resolve(); });
    });
  }

  function rendererCounters(){
    const renderer = rendererReport() || {};
    return {
      fullSceneRedraws:Number(renderer.fullSceneRedraws || 0),
      cardLayerRedraws:Number(renderer.cardLayerRedraws || 0),
      effectLayerRedraws:Number(renderer.effectLayerRedraws || 0),
      particleLayerRedraws:Number(renderer.particleLayerRedraws || 0),
      vfxOnlyDraws:Number(renderer.vfxOnlyDraws || 0),
      vfxFullSceneFallbacks:Number(renderer.vfxFullSceneFallbacks || 0)
    };
  }

  function diffCounters(before, after){
    const out = {};
    Object.keys(after).forEach(function(key){
      out[key] = Number(after[key] || 0) - Number(before[key] || 0);
    });
    return out;
  }

  function layerSmokeTest(){
    const adapter = window.FateMatchRendererAdapter;
    const director = window.FateVfxDirector;
    if(!adapter || typeof adapter.renderFromGameState !== 'function' || !director || typeof director.play !== 'function'){
      lastLayerSmoke = {available:false, pass:false, reason:'renderer-or-director-unavailable'};
      return Promise.resolve(lastLayerSmoke);
    }
    try {
      if(!(rendererReport() && rendererReport().available)) adapter.renderFromGameState({source:'vfx-smoke-prime', dirtyMask:65535});
    } catch(e) {}
    const report = rendererReport() || {};
    const canvas = report.canvas || {};
    const w = Math.max(800, Number(canvas.cssW) || window.innerWidth || 1280);
    const h = Math.max(500, Number(canvas.cssH) || window.innerHeight || 720);
    const before = rendererCounters();
    director.play('DRAW_CARD', {
      fromRect:{x:w - 160, y:h * .18, w:72, h:101},
      toRect:{x:w * .5 - 55, y:h - 170, w:110, h:154}
    });
    return waitFrame().then(waitFrame).then(function(){
      const after = rendererCounters();
      const delta = diffCounters(before, after);
      lastLayerSmoke = {
        available:true,
        pass:delta.vfxOnlyDraws > 0 && delta.cardLayerRedraws === 0 && delta.fullSceneRedraws === 0 && delta.vfxFullSceneFallbacks === 0,
        before,
        after,
        delta,
        acceptance:acceptanceReport()
      };
      return lastLayerSmoke;
    });
  }

  function mdCompletionReport(){
    const acceptance = acceptanceReport();
    const matrix = perfMatrix();
    const vfx = acceptance.vfx || {};
    const motion = acceptance.motionFx || {};
    const checks = [
      {key:'director', label:'VFX Director loaded', pass:!!(vfx && vfx.available)},
      {key:'bridge', label:'Semantic event bridge API complete', pass:!!(acceptance.eventBridgeApi && acceptance.eventBridgeApi.available)},
      {key:'primitives', label:'Required primitive API complete', pass:!!(acceptance.primitives && acceptance.primitives.pass)},
      {key:'recipes', label:'Required semantic recipes complete', pass:acceptance.missingRecipes.length === 0},
      {key:'layers', label:'Effects, particles, UI, and hover layers present', pass:!!(acceptance.layers && acceptance.layers.effects && acceptance.layers.particles && acceptance.layers.ui && acceptance.layers.hover)},
      {key:'motionFacade', label:'Draw/discard/flip/consolidation facade is VFX-owned', pass:!!(motion.ownsDrawFromPile && motion.ownsDiscard && motion.ownsFlip && motion.ownsConsolidation && motion.usesHitMapRects)},
      {key:'drag', label:'Hand drag uses v2 hit maps', pass:acceptance.handDragUsesHitMap && !acceptance.handDragUsesDom},
      {key:'legacyDom', label:'No active legacy live visual DOM', pass:acceptance.domGhostCards === 0 && acceptance.legacyLiveVisuals === 0},
      {key:'lowEffects', label:'Low-effects mode and particle budget are reported', pass:!!(acceptance.capabilities && acceptance.capabilities.lowEffectsToggle && acceptance.particlePool && acceptance.particlePool.maxActiveParticlesLow < acceptance.particlePool.maxActiveParticles)},
      {key:'reducedMotion', label:'Reduced-motion mode is reported', pass:!!(acceptance.capabilities && acceptance.capabilities.reducedMotionToggle)},
      {key:'audio', label:'Audio sync module is available', pass:!!(acceptance.capabilities && acceptance.capabilities.audioSync)},
      {key:'perfMatrix', label:'VFX performance matrix is available', pass:!!(matrix && matrix.available)}
    ];
    const remaining = checks.filter(function(check){ return !check.pass; });
    return {
      available:true,
      version:VERSION,
      architecturallyComplete:acceptance.pass && remaining.length === 0,
      acceptancePass:acceptance.pass,
      remaining:remaining.map(function(check){ return check.label; }),
      checks,
      acceptance,
      perfMatrix:matrix,
      lastLayerSmoke:lastLayerSmoke
    };
  }

  window.fateVfxAcceptanceReport = acceptanceReport;
  window.fateVfxPerfMatrix = perfMatrix;
  window.fateVfxLayerSmokeTest = layerSmokeTest;
  window.fateVfxMdCompletionReport = mdCompletionReport;
})();
