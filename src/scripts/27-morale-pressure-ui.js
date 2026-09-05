(function(){
  'use strict';

  const HUD_ID = 'morale-pressure-hud';
  const STATUS_ID = 'morale-pressure-status-summary';
  const ZONE_FATE_TOOLTIP_ID = 'morale-zone-fate-tooltip';
  let overridePressure = null;
  let presentedMoraleSystem = null;
  let heldMoraleSystem = null;
  let singlePlayerPresentationQueue = Promise.resolve();
  let moraleCalculationPresentationDepth = 0;
  const moraleCalculationPresentationWaiters = [];

  function moraleCalculationEventPresent(events){
    return (Array.isArray(events)?events:[]).some(function(event){return String(event&&event.type||'').toUpperCase()==='MORALE_CYCLE_RESOLVED';});
  }

  function beginMoraleCalculationPresentation(){
    moraleCalculationPresentationDepth++;
  }

  function endMoraleCalculationPresentation(){
    moraleCalculationPresentationDepth=Math.max(0,moraleCalculationPresentationDepth-1);
    if(moraleCalculationPresentationDepth)return;
    const flush=function(){
      if(moraleCalculationPresentationDepth||document.querySelector('.morale-cycle-resolution-reveal')){setTimeout(flush,50);return;}
      moraleCalculationPresentationWaiters.splice(0).forEach(function(callback){try{callback();}catch(error){console.warn('Deferred start-of-turn presentation failed',error);}});
    };
    setTimeout(flush,0);
  }

  function isMoraleCalculationPresentationActive(){
    return moraleCalculationPresentationDepth>0||!!document.querySelector('.morale-cycle-resolution-reveal');
  }

  function runAfterMoraleCalculationPresentation(callback){
    if(typeof callback!=='function')return false;
    if(!isMoraleCalculationPresentationActive()){callback();return true;}
    moraleCalculationPresentationWaiters.push(callback);
    return true;
  }

  function effectActivationPresentationActive(){
    const now=Date.now();
    let lockUntil=0;
    try{
      if(typeof G!=='undefined'&&G)lockUntil=Math.max(
        Number(G._effectActivationPresentationLockUntil)||0,
        Number(G._cinematicUiLockUntil)||0
      );
    }catch(error){}
    return !!document.querySelector('.effect-activation-cinematic')||lockUntil>now;
  }

  function moraleSourceResolutionPending(event){
    const source=findMoraleOverlaySource(event&&(event.overlayTargetIid||event.sourceIid));
    return !!(source&&(source._onlineSetResolutionPending||source._onlineSetResolutionInFlight));
  }

  function waitForEffectActivationPresentation(event){
    return new Promise(function(resolve){
      const startedAt=Date.now();
      const poll=function(){
        const waiting=effectActivationPresentationActive()||moraleSourceResolutionPending(event);
        if(!waiting||Date.now()-startedAt>10000){resolve(true);return;}
        setTimeout(poll,40);
      };
      // Give a sibling authoritative-event listener one browser task to mount
      // or queue the activation cinematic before deciding the result is idle.
      setTimeout(poll,0);
    });
  }

  function enqueueMoralePressurePresentation(events,view,errorLabel){
    const list=Array.isArray(events)?events:[];
    const reserved=moraleCalculationEventPresent(list);
    // Reserve synchronously. endTurn() begins the next turn in the same stack,
    // before a Promise.then callback would otherwise mark the modal active.
    if(reserved)beginMoraleCalculationPresentation();
    singlePlayerPresentationQueue=singlePlayerPresentationQueue
      .then(function(){return presentMoralePressureEvents(list,view,reserved);})
      .finally(function(){if(reserved)endMoraleCalculationPresentation();})
      .catch(function(error){console.warn(errorLabel||'Morale/Pressure presentation failed',error);});
    return singlePlayerPresentationQueue;
  }

  window.isMoraleCalculationPresentationActive=isMoraleCalculationPresentationActive;
  window.runAfterMoraleCalculationPresentation=runAfterMoraleCalculationPresentation;
  window.beginMoraleCalculationPresentation=beginMoraleCalculationPresentation;
  window.endMoraleCalculationPresentation=endMoraleCalculationPresentation;
  let zoneFateTooltipInstalled = false;
  let statusSummaryObserver = null;
  let wideBoardLayoutObserver = null;

  function syncWideOpponentHand(enabled){
    const game = document.getElementById('s-game');
    if(!game) return;
    const opponentSection = game.querySelector('.opp-section');
    const opponentLabel = document.getElementById('opp-hand-lbl');
    const opponentHand = document.getElementById('opp-hand');
    [opponentLabel, opponentHand].forEach(function(node){
      if(!node) return;
      node.hidden = !!enabled;
      if(enabled){
        node.setAttribute('aria-hidden', 'true');
        node.style.setProperty('display', 'none', 'important');
      }else{
        node.removeAttribute('aria-hidden');
        node.style.removeProperty('display');
      }
    });
    opponentSection?.classList.toggle('wide-opponent-hand-hidden', !!enabled);
  }

  function syncWideUtilityPanel(enabled){
    const game = document.getElementById('s-game');
    const gameLeft = game?.querySelector('.game-left');
    const landscape = document.getElementById('landscape-panel');
    const piles = game?.querySelector('.left-piles');
    if(!game || !gameLeft || !landscape || !piles) return null;
    let panel = document.getElementById('match-utility-panel');
    if(enabled){
      if(!panel){
        panel = document.createElement('aside');
        panel.id = 'match-utility-panel';
        panel.className = 'match-utility-panel';
        panel.setAttribute('aria-label', 'Landscape, deck, and discard');
        panel.innerHTML = '<header class="match-utility-heading"><span>Field Resources</span><i aria-hidden="true"></i></header>' +
          '<section class="match-utility-landscape" aria-label="Landscape"></section>' +
          '<section class="match-utility-piles" aria-label="Deck and discard"></section>';
        game.appendChild(panel);
      }
      const landscapeHost = panel.querySelector('.match-utility-landscape') || panel;
      const pileHost = panel.querySelector('.match-utility-piles') || panel;
      if(landscape.parentElement !== landscapeHost) landscapeHost.appendChild(landscape);
      if(piles.parentElement !== pileHost) pileHost.appendChild(piles);
      return panel;
    }
    const ownerSection = gameLeft.querySelector('.left-section:not(.opp-section)') || gameLeft;
    if(panel?.contains(landscape)) ownerSection.insertBefore(landscape, ownerSection.firstChild);
    if(panel?.contains(piles)) ownerSection.appendChild(piles);
    panel?.remove();
    return null;
  }

  function syncWideProfileBanners(enabled){
    const game = document.getElementById('s-game');
    const topbar = game?.querySelector('.topbar');
    const gameLeft = game?.querySelector('.game-left');
    const opponentSection = game?.querySelector('.opp-section');
    const ownerSection = gameLeft?.querySelector('.left-section:not(.opp-section)');
    const opponentBanner = game?.querySelector('.opp-banner');
    const ownerBanner = game?.querySelector('.my-banner');
    if(!game || !topbar || !gameLeft || !opponentBanner || !ownerBanner) return;
    if(enabled){
      // The rebuilt command deck reads consistently from left to right:
      // local player, local Morale/status, turn clock, opponent status/Morale,
      // opponent profile.
      if(ownerBanner.parentElement !== topbar) topbar.insertBefore(ownerBanner, topbar.firstChild);
      if(opponentBanner.parentElement !== topbar) topbar.appendChild(opponentBanner);
      opponentBanner.classList.add('wide-topbar-profile');
      ownerBanner.classList.add('wide-topbar-profile');
      return;
    }
    opponentBanner.classList.remove('wide-topbar-profile');
    ownerBanner.classList.remove('wide-topbar-profile');
    if(opponentSection && opponentBanner.parentElement !== opponentSection) opponentSection.insertBefore(opponentBanner, opponentSection.firstChild);
    if(ownerSection && ownerBanner.parentElement !== ownerSection) {
      const landscape = ownerSection.querySelector('#landscape-panel');
      if(landscape?.nextSibling) ownerSection.insertBefore(ownerBanner, landscape.nextSibling);
      else ownerSection.appendChild(ownerBanner);
    }
  }

  function syncWideBoardLayout(){
    const game = document.getElementById('s-game');
    const board = document.getElementById('board');
    if(!game || !board) return false;
    const matchUiRebuildEnabled = window.FATE_MATCH_UI_REBUILD_ENABLED !== false;
    game.classList.toggle('match-ui-rebuild', matchUiRebuildEnabled);
    // Single-player builds the four-column rows directly and historically did
    // not add the class used by the wide-layout CSS. Keep the DOM marker in
    // sync with the reversible rule flag so both renderers activate the same
    // presentation.
    const zone444Enabled = window.FATE_ZONE_444_LAYOUT_ENABLED !== false;
    board.classList.toggle('zone-layout-444', zone444Enabled);
    const enabled = matchUiRebuildEnabled
      && window.FATE_WIDE_444_BOARD_LAYOUT_ENABLED !== false
      && zone444Enabled;
    game.classList.toggle('wide-zone-layout-444', enabled);
    syncWideOpponentHand(enabled);
    if(matchUiRebuildEnabled){
      if(typeof window.FateMatchUiRebuild?.sync === 'function') window.FateMatchUiRebuild.sync();
    }else{
      syncWideProfileBanners(enabled);
      syncWideUtilityPanel(enabled);
    }
    return enabled;
  }

  function ensureWideBoardLayoutSync(){
    const board = document.getElementById('board');
    syncWideBoardLayout();
    if(wideBoardLayoutObserver || !board || typeof MutationObserver !== 'function') return;
    wideBoardLayoutObserver = new MutationObserver(syncWideBoardLayout);
    wideBoardLayoutObserver.observe(board, {attributes:true,attributeFilter:['class']});
  }

  function synthMoralePressureCue(kind){
    try{
      if(typeof window.getAudioCtx !== 'function' && typeof getAudioCtx !== 'function') return false;
      const ctx = typeof window.getAudioCtx === 'function' ? window.getAudioCtx() : getAudioCtx();
      const bus = typeof window.getFateSfxBus === 'function' ? window.getFateSfxBus(ctx) : ctx.destination;
      const output = ctx.createGain();
      const master = typeof _masterVol === 'number' ? _masterVol : 1;
      const sfx = typeof _sfxVol === 'number' ? _sfxVol : .8;
      output.gain.value = Math.max(0, Math.min(.42, master * sfx * .32));
      output.connect(bus.input || bus);
      const now = ctx.currentTime;
      const tones = ({
        'pressure-gain':[[520,760,.22,'triangle'],[780,980,.17,'sine']],
        'pressure-loss':[[330,190,.28,'triangle']],
        'morale-damage':[[150,72,.38,'sawtooth'],[92,58,.42,'sine']],
        'morale-heal':[[392,520,.28,'sine'],[494,659,.34,'triangle']],
        'morale-shield-gain':[[610,940,.3,'sine'],[910,1280,.24,'triangle']],
        'morale-shield-break':[[760,260,.22,'square'],[390,105,.34,'triangle']],
        'seal-award':[[392,587,.38,'triangle'],[494,740,.42,'sine'],[659,988,.48,'sine']],
        'seal-checkpoint':[[294,440,.42,'triangle'],[440,660,.5,'sine']],
        'morale-break':[[170,48,.72,'sawtooth'],[88,38,.8,'triangle']]
      })[String(kind || '')] || [];
      tones.forEach(function(spec, index){
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + index * .045;
        osc.type = spec[3];
        osc.frequency.setValueAtTime(spec[0], start);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, spec[1]), start + spec[2]);
        gain.gain.setValueAtTime(.001, start);
        gain.gain.exponentialRampToValueAtTime(.18 / Math.max(1, index + 1), start + .035);
        gain.gain.exponentialRampToValueAtTime(.001, start + spec[2]);
        osc.connect(gain); gain.connect(output); osc.start(start); osc.stop(start + spec[2] + .03);
      });
      return tones.length > 0;
    }catch(e){ return false; }
  }

  function playMoralePressureSfx(kind){
    const mapped = ({
      'pressure-gain':'onlineRemote',
      'pressure-loss':'fateLose',
      'morale-damage':'characterSet_Dauntless',
      'morale-heal':'fateGain',
      'morale-shield-gain':'immuneShield',
      'morale-shield-break':'zoneBlock',
      'seal-award':'levelUp',
      'seal-checkpoint':'coinFlip',
      'morale-break':'forfeit'
    })[String(kind || '')];
    if(synthMoralePressureCue(kind)) return true;
    if(!mapped || typeof window.playSfx !== 'function') return false;
    if(typeof window.playFateSfxOnce === 'function'){
      return window.playFateSfxOnce(mapped, 'morale-pressure:' + mapped, mapped === 'onlineRemote' ? 90 : 180);
    }
    window.playSfx(mapped);
    return true;
  }

  function perspectivePlayer(){
    try{
      if(typeof window.getPerspectivePlayerIndex === 'function') return Number(window.getPerspectivePlayerIndex()) === 1 ? 1 : 0;
    }catch(e){}
    return 0;
  }

  function currentSystem(explicit){
    if(explicit && typeof explicit === 'object') return explicit;
    try{
      if(typeof G !== 'undefined' && G && G._moralePressure) return G._moralePressure;
    }catch(e){}
    return null;
  }

  function getPresentedMoraleSystem(){
    return presentedMoraleSystem || heldMoraleSystem;
  }

  function sameMoraleValues(left,right){
    return !!left && !!right
      && Number(left.morale?.[0]) === Number(right.morale?.[0])
      && Number(left.morale?.[1]) === Number(right.morale?.[1]);
  }

  function releaseMoralePresentationHold(authoritativeSystem){
    if(!heldMoraleSystem) return false;
    if(authoritativeSystem && !sameMoraleValues(heldMoraleSystem,authoritativeSystem)) return false;
    heldMoraleSystem=null;
    refreshVisibleMatchMoraleSurface();
    return true;
  }

  function legacyGameState(){
    try{
      if(typeof window.getFateGameState === 'function') return window.getFateGameState();
      if(typeof G !== 'undefined') return G;
    }catch(e){}
    return null;
  }

  function legacyGameEligible(){
    const state = legacyGameState();
    return !!state
      && state.aiEnabled === true
      && !state._onlineRoomCode
      && state._phase7CurrentMultiplayer !== true;
  }

  function legacyRulesEnabled(){
    return legacyGameEligible() && window.FATE_MORALE_PRESSURE_RULES_ENABLED === true;
  }

  function legacySealRulesEnabled(){
    return legacyRulesEnabled();
  }

  function createLegacyMoralePressureState(startingPlayer){
    return {
      version:1,
      maxMorale:200,
      morale:[200,200],
      shields:[0,0],
      seals:[0,0],
      pressure:[0,0],
      ledger:[[],[]],
      generated:[[],[]],
      realityReductionSources:[[],[]],
      startingPlayer:Number(startingPlayer) === 1 ? 1 : 0,
      cycle:1,
      nextEntry:1,
      moraleBrokenAwarded:[false,false],
      checkpoints:[],
      pendingThresholdDiscards:[],
      consolidationsThisTurn:[0,0],
      drawAlternation:[0,0]
      ,lastPressureWinner:null
    };
  }

  function legacyMoralePercent(player){
    const system = legacyGameState()?._moralePressure;
    if(!legacyRulesEnabled() || !system) return 100;
    const max = Math.max(1, Number(system.maxMorale || 200));
    return Math.max(0, Number(system.morale?.[Number(player)] || 0)) / max * 100;
  }

  function legacyMoralePenaltyActive(player, threshold){
    return legacyRulesEnabled() && legacyMoralePercent(player) <= Number(threshold);
  }

  function legacyMoraleConsolidationAllowed(player){
    const state = legacyGameState();
    const system = state?._moralePressure;
    if(!system || !legacyMoralePenaltyActive(player, 80)) return true;
    if(!Array.isArray(system.consolidationsThisTurn)) system.consolidationsThisTurn = [0,0];
    return Math.max(0, Number(system.consolidationsThisTurn[Number(player)] || 0)) < 2;
  }

  function recordLegacyMoraleConsolidation(player){
    const system = legacyGameState()?._moralePressure;
    if(!system) return 0;
    if(!Array.isArray(system.consolidationsThisTurn)) system.consolidationsThisTurn = [0,0];
    const seat = Number(player);
    system.consolidationsThisTurn[seat] = Math.max(0, Number(system.consolidationsThisTurn[seat] || 0)) + 1;
    return system.consolidationsThisTurn[seat];
  }

  function resetLegacyMoraleTurnCounters(player){
    const system = legacyGameState()?._moralePressure;
    if(!system) return;
    if(!Array.isArray(system.consolidationsThisTurn)) system.consolidationsThisTurn = [0,0];
    system.consolidationsThisTurn[Number(player)] = 0;
  }

  function shouldSkipLegacyMoraleDraw(player){
    const system = legacyGameState()?._moralePressure;
    if(!system) return false;
    if(!Array.isArray(system.drawAlternation)) system.drawAlternation = [0,0];
    const seat = Number(player);
    if(!legacyMoralePenaltyActive(seat, 60)){
      system.drawAlternation[seat] = 0;
      return false;
    }
    system.drawAlternation[seat] = Math.max(0, Number(system.drawAlternation[seat] || 0)) + 1;
    return system.drawAlternation[seat] % 2 === 0;
  }

  function resolveLegacyMoraleSupporterExpiry(player){
    const state = legacyGameState();
    if(!state?._moralePressure) return [];
    const active = legacyMoralePenaltyActive(player, 20);
    const expired = [];
    legacyBoardEntries(state).filter(function(entry){
      return Number(entry.card?.owner) === Number(player) && legacyEffectType(entry.card) === 'Supporter';
      }).forEach(function(entry){
        const card = entry.card;
        const immune = typeof isFullyEffectImmuneCard === 'function'
          ? isFullyEffectImmuneCard(card)
          : (typeof isCardEffectImmutable === 'function' && isCardEffectImmutable(card));
        if(immune){
          delete card._moraleSupporterExpiryTurns;
          delete card._moraleSupporterExpiryStartedTurn;
          return;
        }
      if(!active){
        delete card._moraleSupporterExpiryTurns;
        delete card._moraleSupporterExpiryStartedTurn;
        return;
      }
      if(!Number.isFinite(Number(card._moraleSupporterExpiryStartedTurn))){
        card._moraleSupporterExpiryStartedTurn = Number(state.turn || 1);
        card._moraleSupporterExpiryTurns = 1;
        return;
      }
      card._moraleSupporterExpiryTurns = Math.max(0, Number(card._moraleSupporterExpiryTurns || 0)) + 1;
      if(card._moraleSupporterExpiryTurns >= 2) expired.push(entry);
    });
    expired.forEach(function(entry){
      const card = state.board?.[entry.z]?.[entry.r]?.[entry.c];
      if(!card) return;
      delete card._moraleSupporterExpiryTurns;
      delete card._moraleSupporterExpiryStartedTurn;
      state.board[entry.z][entry.r][entry.c] = null;
      if(typeof window.fatePushDiscard === 'function') window.fatePushDiscard(Number(player), card, {sound:false});
      else if(typeof fatePushDiscard === 'function') fatePushDiscard(Number(player), card, {sound:false});
      if(typeof window.toast === 'function') window.toast((card.name || 'Supporter') + ' discarded itself after two turns at low Morale.');
    });
    if(expired.length){
      try{ if(typeof playDiscardSfx === 'function') playDiscardSfx(); }catch(e){}
      try{ if(typeof renderGame === 'function') renderGame({board:true,scores:true,piles:true,topbar:true}); }catch(e){}
    }
    return expired.map(function(entry){ return String(entry.card?.iid || ''); });
  }

  function legacyBoardEntries(state){
    const entries = [];
    (state?.board || []).forEach(function(zone,z){
      (zone || []).forEach(function(row,r){
        (row || []).forEach(function(card,c){ if(card) entries.push({card,z,r,c}); });
      });
    });
    return entries;
  }

  function legacyFaceDown(card){
    try { return typeof window.isFaceDownCard === 'function' ? window.isFaceDownCard(card) : card?.faceDown === true; }
    catch(e){ return card?.faceDown === true; }
  }

  function legacyEffectType(card){
    try { return String(typeof window.getCardEffectType === 'function' ? window.getCardEffectType(card) : card?.type || ''); }
    catch(e){ return String(card?.type || ''); }
  }

  function legacySuppressed(entry){
    try{
      return typeof window.isCardEffectSuppressed === 'function'
        && window.isCardEffectSuppressed(entry.card, entry.z, entry.r, entry.c);
    }catch(e){ return false; }
  }

  function legacyAffiliation(card){
    return String(card?.aff || card?.affiliation || '').trim().toLowerCase();
  }

  function legacyPersistentEntries(state, player){
    const entries = [];
    const board = legacyBoardEntries(state);
    board.forEach(function(entry){
      const card = entry.card;
      if(Number(card.owner) !== Number(player) || legacyFaceDown(card)) return;
      const type = legacyEffectType(card).replace(/^Improviser$/i,'Improvisor');
      const suppressed = legacySuppressed(entry);
      if(type === 'Dauntless' && !suppressed){
        entries.push({key:'dauntless:'+card.iid,playerIndex:player,amount:3,reason:'DAUNTLESS_UNSUPPRESSED',sourceIid:String(card.iid || ''),sourceName:String(card.name || 'Dauntless'),affectedIids:[]});
      }
      const pressureModifier=Number(card._pressureModifier||card.pressureModifier||0);
      if(pressureModifier) entries.push({key:'card-pressure-modifier:'+card.iid,playerIndex:player,amount:pressureModifier,reason:'CARD_PRESSURE_MODIFIER',sourceIid:String(card.iid||''),cardIid:String(card.iid||''),sourceName:String(card.name||'Card'),affectedIids:[String(card.iid||'')]});
      if(Number(card._pressureTurn)===Number(state.turn)&&Number(card._pressureTurnBonus||0)) entries.push({key:'card-pressure-turn:'+card.iid+':t'+state.turn,playerIndex:player,amount:Number(card._pressureTurnBonus||0),reason:'CARD_TURN_PRESSURE',sourceIid:String(card.iid||''),cardIid:String(card.iid||''),sourceName:String(card.name||'Card'),affectedIids:[String(card.iid||'')]});
      if(type === 'Coordinator' && !suppressed){
        const affected = board.filter(function(target){
          return target.card !== card && !legacyFaceDown(target.card) && target.z === entry.z
            && Math.abs(target.r-entry.r) + Math.abs(target.c-entry.c) === 1;
        });
        if(affected.length){
          entries.push({key:'coordinator:'+card.iid,playerIndex:player,amount:affected.length,reason:'COORDINATOR_ADJACENCY',sourceIid:String(card.iid || ''),sourceName:String(card.name || 'Coordinator'),affectedIids:affected.map(function(target){return String(target.card.iid || '');})});
        }
      }
    });
    return entries;
  }

  function legacyMapByKey(entries){
    const result = new Map();
    (entries || []).forEach(function(entry){ result.set(String(entry.key),entry); });
    return result;
  }

  function finalizeLegacyPressureEvents(events, before){
    const running = before.slice(0,2);
    events.forEach(function(event){
      if(String(event?.type || '').toUpperCase() !== 'PRESSURE_CHANGED') return;
      const player = Number(event.playerIndex);
      if(player !== 0 && player !== 1) return;
      event.beforePressure = running[player];
      running[player] = Math.max(0,running[player] + Number(event.amount || 0));
      event.afterPressure = running[player];
    });
  }

  function queueLegacyPresentation(events){
    const state = legacyGameState();
    if(!state?._moralePressure) return;
    const list = Array.isArray(events) ? events.filter(Boolean) : [];
    renderMoralePressureHud(state._moralePressure);
    if(!list.length) return;
    const view = {state:{moralePressure:state._moralePressure}};
    enqueueMoralePressurePresentation(list,view,'Legacy Morale/Pressure presentation failed');
  }

  function presentLegacyMoraleDelta(options){
    const opts=options||{};
    const player=Number(opts.playerIndex);
    const before=Number(opts.before);
    const after=Number(opts.after);
    if((player!==0&&player!==1)||!Number.isFinite(before)||!Number.isFinite(after)||before===after)return false;
    const event={
      type:after>before?'MORALE_HEALED':'MORALE_DAMAGED',
      playerIndex:player,
      amount:Math.abs(after-before),
      before:before,
      after:after,
      sourceIid:opts.sourceIid?String(opts.sourceIid):null
    };
    ['overlayTargetIid','semanticSourceCardId','reason','sourcePlayerIndex'].forEach(function(key){
      if(opts[key]!==undefined&&opts[key]!==null&&opts[key]!=='')event[key]=opts[key];
    });
    return refreshLegacyMoralePressure({announce:true,events:[event]});
  }

  function refreshLegacyMoralePressure(options){
    const state = legacyGameState();
    if(!legacyRulesEnabled() || !state?._moralePressure) return false;
    const system = state._moralePressure;
    const opts = options || {};
    const events = Array.isArray(opts.events) ? opts.events : [];
    const before = system.pressure.slice(0,2).map(function(value){return Math.max(0,Number(value)||0);});
    for(let player=0;player<2;player+=1){
      const oldLedger = Array.isArray(system.ledger[player]) ? system.ledger[player] : [];
      const persistent = legacyPersistentEntries(state,player);
      const positive = persistent.reduce(function(sum,entry){return sum+Number(entry.amount||0);},0)
        + system.generated[player].reduce(function(sum,entry){return sum+Number(entry.amount||0);},0);
      if(player === Number(system.startingPlayer) && positive > 0){
        persistent.push({key:'initiative:'+system.cycle+':p'+player,playerIndex:player,amount:2,reason:'STARTING_PLAYER_INITIATIVE',sourceIid:null,sourceName:'Initiative',affectedIids:[]});
      }
      const nextLedger = [].concat(system.generated[player],persistent,system.realityReductionSources[player] || []);
      if(opts.announce === true){
        const oldMap = legacyMapByKey(oldLedger);
        const nextMap = legacyMapByKey(nextLedger);
        nextLedger.forEach(function(entry){
          if(String(entry.key).startsWith('generated:')) return;
          const delta = Number(entry.amount||0)-Number(oldMap.get(String(entry.key))?.amount||0);
          if(delta) events.push({type:'PRESSURE_CHANGED',playerIndex:player,amount:delta,reason:entry.reason,sourceIid:entry.sourceIid,sourceName:entry.sourceName,affectedIids:entry.affectedIids});
        });
        oldLedger.forEach(function(entry){
          if(nextMap.has(String(entry.key)) || String(entry.key).startsWith('generated:') || Number(entry.amount||0) <= 0) return;
          events.push({type:'PRESSURE_CHANGED',playerIndex:player,amount:-Number(entry.amount||0),reason:entry.reason,sourceIid:entry.sourceIid,sourceName:entry.sourceName,affectedIids:entry.affectedIids});
        });
      }
      system.ledger[player] = nextLedger;
      system.pressure[player] = Math.max(0,nextLedger.reduce(function(sum,entry){return sum+Number(entry.amount||0);},0));
    }
    finalizeLegacyPressureEvents(events,before);
    if(opts.present !== false) queueLegacyPresentation(events);
    else renderMoralePressureHud(system);
    return true;
  }

  function initializeLegacyMoralePressure(startingPlayer){
    const state = legacyGameState();
    if(!legacySealRulesEnabled() || !state) return false;
    state._moralePressure = createLegacyMoralePressureState(startingPlayer);
    if(legacyRulesEnabled()) refreshLegacyMoralePressure({announce:false,present:false});
    else renderMoralePressureHud(state._moralePressure);
    return true;
  }

  function addLegacyGeneratedPressure(player,amount,reason,card){
    const state = legacyGameState();
    const system = state?._moralePressure;
    if(!system || !amount) return null;
    const entry = {key:'generated:'+system.cycle+':'+system.nextEntry++,playerIndex:Number(player),amount:Number(amount),reason:String(reason),sourceIid:card?.iid?String(card.iid):null,sourceName:String(card?.name||'Card'),affectedIids:[]};
    system.generated[player].push(entry);
    return {type:'PRESSURE_CHANGED',playerIndex:Number(player),amount:Number(amount),reason:entry.reason,sourceIid:entry.sourceIid,sourceName:entry.sourceName,affectedIids:[]};
  }

  function modifyLegacyCardPressure(card,amount,options){
    const state=legacyGameState();
    if(!legacyRulesEnabled()||!state?._moralePressure||!card)return false;
    const opts=options||{};
    refreshLegacyMoralePressure({announce:false,present:false});
    const current=getCardCurrentPressure(card,state._moralePressure);
    const delta=current*(Number.isFinite(Number(opts.multiplier))?Number(opts.multiplier)-1:0)+Number(amount||0);
    if(!delta)return true;
    if(opts.temporaryTurn){card._pressureTurn=Number(state.turn);card._pressureTurnBonus=Number(card._pressureTurnBonus||0)+delta;}
    else card._pressureModifier=Number(card._pressureModifier||0)+delta;
    refreshLegacyMoralePressure({announce:true});
    return true;
  }

  function recordLegacyMoralePressureCardSet(card, options){
    const state = legacyGameState();
    if(!legacyRulesEnabled() || !state?._moralePressure || !card || legacyFaceDown(card)) return false;
    const player = Number(card.owner);
    const system = state._moralePressure;
    const events = [];
    const pressureReworks = window.FATE_PRESSURE_CARD_REWORKS_ENABLED === true
      || state?.gameSettings?.pressureCardReworks === true
      || state?._freePlayGameSettings?.pressureCardReworks === true;
    // Placement is committed before the WHEN_SET reaction window opens. Keep
    // pressure accounting current at commit time, but do not apply a reworked
    // WHEN_SET result until Lydia/Secules/Havano have had the opportunity to
    // negate it.
    const resolveWhenSetEffects = options?.resolveWhenSetEffects === true
      || !(card._onlineSetResolutionPending || card._onlineSetResolutionInFlight);
    if(resolveWhenSetEffects&&String(card.id||'')==='64')card._doubleNextMoraleDamage=true;
    if(pressureReworks && resolveWhenSetEffects){
      if(String(card.id||'')==='33'){
        const before=Number(system.morale[player]||0);system.morale[player]=Math.min(Number(system.maxMorale||200),before+16);
        if(system.morale[player]>before) events.push({type:'MORALE_HEALED',playerIndex:player,amount:system.morale[player]-before,before:before,after:system.morale[player],sourceIid:String(card.iid||'')});
      }
      if(String(card.id||'')==='47'){
        const opponent=1-player;
        const before=Number(system.morale[opponent]||0);
        const block=state._southWindMoraleBlock;
        const blocked=!!(block
          && Number(block.targetPlayer)===player
          && Number(block.activeFromTurn)<=Number(state.turn)
          && Number(block.remainingTargetTurns)>0);
        system.morale[opponent]=blocked?before:Math.max(0,before-10);
        if(system.morale[opponent]<before) events.push({type:'MORALE_DAMAGED',playerIndex:opponent,sourcePlayerIndex:player,amount:before-system.morale[opponent],before:before,after:system.morale[opponent],sourceIid:String(card.iid||'')});
      }
    }
    refreshLegacyMoralePressure({announce:true,events:events.filter(Boolean)});
    return true;
  }

  function recordLegacyMoralePressureActivation(card){
    const state = legacyGameState();
    if(!legacyRulesEnabled() || !state?._moralePressure || !card || legacyFaceDown(card)) return false;
    const cardType = legacyEffectType(card).replace(/^Improviser$/i,'Improvisor');
    if(cardType !== 'Improvisor' && cardType !== 'Initiator'){
      refreshLegacyMoralePressure({announce:true});
      return false;
    }
    const amount = cardType === 'Initiator' ? 3 : 1;
    const reason = cardType === 'Initiator' ? 'INITIATOR_ACTIVATED' : 'IMPROVISOR_ACTIVATED';
    const event = addLegacyGeneratedPressure(Number(card.owner),amount,reason,card);
    refreshLegacyMoralePressure({announce:true,events:event?[event]:[]});
    return true;
  }

  function recordLegacyMoralePressureDraw(card,player,options){
    const state = legacyGameState();
    if(!legacyRulesEnabled() || !state?._moralePressure || !card || options?.openingHand) return false;
    refreshLegacyMoralePressure({announce:true});
    return true;
  }

  function legacyPressureDamage(difference){
    return Math.max(0,Number(difference)||0);
  }

  function creditCardMoraleDamage(card, amount){
    const dealt=Math.max(0,Math.floor(Number(amount)||0));
    if(!card||!dealt)return 0;
    card._moraleDamageInflicted=Math.max(0,Math.floor(Number(card._moraleDamageInflicted)||0))+dealt;
    return dealt;
  }

  function commitLegacyMoraleThresholdDiscard(entry, pending){
    const state = legacyGameState();
    if(!state || !entry?.card || state.board?.[entry.z]?.[entry.r]?.[entry.c] !== entry.card) return false;
    state.board[entry.z][entry.r][entry.c] = null;
    if(typeof fatePushDiscard === 'function') fatePushDiscard(Number(pending.targetPlayerIndex), entry.card);
    else state.players[Number(pending.targetPlayerIndex)].discard.push(entry.card);
    if(typeof applyContinuousEffects === 'function') applyContinuousEffects();
    if(typeof renderEffectResolutionForPlayer === 'function') renderEffectResolutionForPlayer(Number(pending.chooserPlayerIndex), {hand:false,piles:true,scores:true,topbar:true});
    if(typeof toast === 'function') toast(entry.card.name + ' was discarded after Morale fell to 50.');
    return true;
  }

  function processLegacyMoraleThresholdDiscards(){
    const state = legacyGameState();
    const queue = state?._moralePressure?.pendingThresholdDiscards;
    if(!Array.isArray(queue) || !queue.length) return Promise.resolve(false);
    const pending = queue.shift();
    const entries = legacyBoardEntries(state).filter(function(entry){return Number(entry.card.owner) === Number(pending.targetPlayerIndex);});
    if(!entries.length) return processLegacyMoraleThresholdDiscards();
    const chooser = Number(pending.chooserPlayerIndex);
    if(state.aiEnabled === true && chooser === 1){
      const selected = entries.slice().sort(function(a,b){
        const af = typeof getEffectiveFate === 'function' ? getEffectiveFate(a.card,a.z) : Number(a.card.currentFate||a.card.fate||0);
        const bf = typeof getEffectiveFate === 'function' ? getEffectiveFate(b.card,b.z) : Number(b.card.currentFate||b.card.fate||0);
        return bf-af;
      })[0];
      commitLegacyMoraleThresholdDiscard(selected,pending);
      return processLegacyMoraleThresholdDiscards();
    }
    if(typeof showBoardTargetPicker !== 'function'){
      commitLegacyMoraleThresholdDiscard(entries[0],pending);
      return processLegacyMoraleThresholdDiscards();
    }
    return new Promise(function(resolve){
      const open = function(){
        showBoardTargetPicker({
          title:'Morale Broken — Choose a Card',
          prompt:'Your opponent fell to 50 Morale. Choose any card on their field to discard.',
          entries:entries,
          zones:[0,1,2],
          visibleZones:[0,1,2],
          maxCount:1,
          minCount:1,
          confirmLabel:'Discard Card',
          viewerPlayerIndex:chooser,
          showZoneTitles:true,
          showOpponentOverlay:true,
          onCancel:open
        },function(selected){
          commitLegacyMoraleThresholdDiscard(selected?.[0],pending);
          processLegacyMoraleThresholdDiscards().then(resolve);
        });
      };
      open();
    });
  }

  function legacyCheckpointAwards(turn,maxTurns){
    const currentTurn=Number(turn);
    const finalTurn=Math.max(1,Number(maxTurns)||24);
    if(window.FATE_ZONE_CONTROL_REWORK_ENABLED===false){
      if(currentTurn===6)return {morale:0,zones:3};
      if(currentTurn===12)return {morale:0,zones:5};
      if(currentTurn===finalTurn)return {morale:0,zones:8};
      return null;
    }
    if(currentTurn===6)return {morale:0,zones:1};
    if(currentTurn===12)return {morale:0,zones:3};
    if(currentTurn===18)return {morale:0,zones:2};
    if(currentTurn===finalTurn)return {morale:0,zones:6};
    return null;
  }

  function resolveLegacyMoralePressureTurnEnd(endingPlayer){
    const state = legacyGameState();
    if(!legacyRulesEnabled() || !state?._moralePressure) return false;
    const expired = resolveLegacyMoraleSupporterExpiry(Number(endingPlayer));
    const turn = Number(state.turn);
    const events = [];
    // Match the canonical rule: no Morale calculation on Turn 2. The
    // every-two-turn cadence starts at the end of Turn 4.
    if(turn < 4 || turn%2!==0){
      const lowMoraleDiscard = resolveLegacyMoraleLowHandDiscard(Number(endingPlayer));
      if(lowMoraleDiscard) events.push(lowMoraleDiscard);
      if(events.length) queueLegacyPresentation(events);
      return expired.length > 0 || events.length > 0;
    }
    const system = state._moralePressure;
    const zoneResults=[0,1,2].map(function(zone){
      const scores=[getZoneScore(zone,0),getZoneScore(zone,1)];
      const controller=scores[0]>scores[1]?0:(scores[1]>scores[0]?1:null);
      return {zone:zone,scores:scores,controller:controller,difference:Math.abs(scores[0]-scores[1]),damagedPlayer:controller===null?null:1-controller};
    });
    const pacificaPreventsMoraleDamage = String(state.landscapeId || '') === 'igb1';
    const damage=[0,0];
    // These totals are also used below when damage is attributed back to the
    // cards that created it. Keep them in the turn-resolution scope: declaring
    // them only inside the rework branch made the first damaging even turn
    // throw before presentation and before endTurn could advance the player.
    const outgoing=[0,0];
    const outgoingSources=[[],[]];
    zoneResults.forEach(function(result){if(!pacificaPreventsMoraleDamage&&(result.damagedPlayer===0||result.damagedPlayer===1))damage[result.damagedPlayer]+=Math.floor(result.difference/2);});
    const entries=legacyBoardEntries(state).filter(function(entry){return entry.card&&!legacyFaceDown(entry.card)&&!legacySuppressed(entry);});
    if(entries.length){
      entries.forEach(function(entry){
        const source=entry.card;
        const owner=Number(source.owner);
        const id=String(source.id||'');
        let sourceDamage=0;
        let affectedIids=[];
        const whisperRozsi=String(source._whisperCopiedEffectId||'')==='34';
        if(((typeof cardActsAsPassive==='function'?cardActsAsPassive(source,'34'):id==='34')||whisperRozsi)&&source._moraleAffiliation){
          const affected=entries.filter(function(target){return Number(target.card.owner)===owner&&(whisperRozsi||Number(target.z)===Number(entry.z))&&String(target.card.aff||target.card.affiliation||'')===String(source._moraleAffiliation);});
          sourceDamage=affected.length*2;
          affectedIids=affected.map(function(target){return String(target.card&&target.card.iid||'');}).filter(Boolean);
        }else if(id==='35'){
          const fate=typeof getEffectiveFate==='function'?getEffectiveFate(source,entry.z):Number(source.currentFate??source.fate??0);
          sourceDamage=Math.floor(Math.max(0,Number(fate)||0)/2);
        }
        if(sourceDamage>0){
          outgoing[owner]+=sourceDamage;
          outgoingSources[owner].push({card:source,amount:sourceDamage,affectedIids:affectedIids});
        }
      });
      for(let owner=0;owner<2;owner+=1){
        const doublers=entries.filter(function(entry){return Number(entry.card.owner)===owner&&String(entry.card.id||'')==='64'&&entry.card._doubleNextMoraleDamage===true;});
        if(doublers.length){const multiplier=Math.pow(2,doublers.length);damage[1-owner]*=multiplier;outgoing[owner]*=multiplier;outgoingSources[owner].forEach(function(source){source.amount*=multiplier;});doublers.forEach(function(entry){entry.card._doubleNextMoraleDamage=false;});}
        const block=state._southWindMoraleBlock;
        if(block&&Number(block.targetPlayer)===owner&&Number(block.activeFromTurn)<=Number(state.turn)&&Number(block.remainingTargetTurns)>0){
          damage[1-owner]=0;
          outgoing[owner]=0;
          outgoingSources[owner]=[];
        }
      }
      for(let owner=0;owner<2;owner+=1)damage[1-owner]+=outgoing[owner];
    }
    const bh18ZoneFateReductions=[];
    for(let player=0;player<2;player+=1){
      if(Math.max(0,Number(damage[player])||0)<=0)continue;
      entries.filter(function(entry){return Number(entry.card.owner)===player&&String(entry.card.id||'')==='bh18';}).forEach(function(entry){
        const key=['bh18',String(entry.card.iid||entry.card.id),String(system.cycle||0),'p'+String(1-player),'z'+String(entry.z)].join('_');
        if(!state.fateModifiers||typeof state.fateModifiers!=='object')state.fateModifiers={};
        state.fateModifiers[key]=Number(state.fateModifiers[key]||0)-3;
        bh18ZoneFateReductions.push({sourceIid:String(entry.card.iid||''),sourceCardId:'bh18',sourceController:player,playerIndex:1-player,zone:Number(entry.z),value:-3,reason:'GENESIS_OF_ALL_INCELDOM'});
      });
    }
    events.push({
      type:'MORALE_CYCLE_RESOLVED',
      zoneResults:zoneResults,
      damage:damage.slice(),
      bh18ZoneFateReductions:bh18ZoneFateReductions,
      moraleDamageSources:outgoingSources.map(function(sources){return sources.map(function(source){return {
        sourceIid:String(source.card&&source.card.iid||''),
        sourceCardId:String(source.card&&source.card.id||''),
        amount:Math.max(0,Number(source.amount)||0),
        affectedIids:(source.affectedIids||[]).slice()
      };});}),
      moraleBefore:system.morale.slice()
    });
    for(let player=0;player<2;player+=1){
      const incoming=Math.max(0,Number(damage[player])||0);
      if(!incoming)continue;
      const before=Math.max(0,Number(system.morale[player])||0);
      system.morale[player]=Math.max(0,before-incoming);
      const actualDamage=before-system.morale[player];
      if(window.FATE_PRESSURE_CARD_REWORKS_ENABLED === true){
        const sourceOwner=1-player;
        const baseDamage=Math.max(0,incoming-(outgoing[sourceOwner]||0));
        let attributable=Math.max(0,actualDamage-Math.min(actualDamage,baseDamage));
        outgoingSources[sourceOwner].forEach(function(source){
          const credited=Math.min(attributable,Math.max(0,Number(source.amount)||0));
          creditCardMoraleDamage(source.card,credited);
          attributable-=credited;
        });
      }
      events.push({
        type:'MORALE_DAMAGED',playerIndex:player,sourcePlayerIndex:1-player,
        amount:actualDamage,incomingDamage:incoming,before:before,after:system.morale[player],
        moraleDamageSources:outgoingSources[1-player].map(function(source){return {
          sourceIid:String(source.card&&source.card.iid||''),
          sourceCardId:String(source.card&&source.card.id||''),
          amount:Math.max(0,Number(source.amount)||0),
          affectedIids:(source.affectedIids||[]).slice()
        };}),
        zoneResults:zoneResults
      });
      if(before>0&&system.morale[player]===0)events.push({type:'MORALE_BROKEN',playerIndex:player,sourcePlayerIndex:1-player});
    }
    if(String(state.landscapeId||'')==='igb23'){
      for(let player=0;player<2;player+=1){
        const before=Math.max(0,Number(system.morale[player])||0);
        const requested=Math.max(0,Number(state.players?.[player]?.hand?.length||0)*2);
        const after=Math.min(Number(system.maxMorale||200),before+requested);
        const amount=after-before;
        system.morale[player]=after;
        if(amount)events.push({type:'MORALE_HEALED',playerIndex:player,amount:amount,before:before,after:after,sourceIid:'landscape:igb23',semanticSourceCardId:'igb23',reason:'SHORES_OF_LA_HELENA'});
      }
    }
    (state.blockedCells||[]).filter(function(block){return block&&block.type==='jamie';}).forEach(function(block){
      const player=Number(block.owner);
      const card=state.board?.[Number(block.z)]?.[Number(block.r)]?.[Number(block.c)]||null;
      if((player!==0&&player!==1)||!card)return;
      const fate=typeof getEffectiveFate==='function'?getEffectiveFate(card,Number(block.z)):Number(card.currentFate??card.fate??0);
      const before=Math.max(0,Number(system.morale[player])||0);
      const after=Math.min(Number(system.maxMorale||200),before+Math.max(0,Number(fate)||0));
      const amount=after-before;
      if(!amount)return;
      system.morale[player]=after;
      const source=entries.map(function(entry){return entry.card;}).find(function(entryCard){return String(entryCard.iid||'')===String(block.sourceIid||'');});
      if(source)source._moraleRecoveredFromSquare=Math.max(0,Number(source._moraleRecoveredFromSquare)||0)+amount;
      events.push({type:'MORALE_HEALED',playerIndex:player,amount:amount,before:before,after:after,sourceIid:block.sourceIid,overlayTargetIid:String(card.iid||''),semanticSourceCardId:'bh22',reason:'A_MOONLIT_SHORE'});
    });
    const lowMoraleDiscard = resolveLegacyMoraleLowHandDiscard(Number(endingPlayer));
    if(lowMoraleDiscard) events.push(lowMoraleDiscard);
    system.cycle+=1;
    queueLegacyPresentation(events);
    return true;
  }

  function resolveLegacyMoraleLowHandDiscard(player){
    const state = legacyGameState();
    const seat = Number(player);
    const system = state?._moralePressure;
    const morale = Math.max(0, Number(system?.morale?.[seat] || 0));
    const hand = state?.players?.[seat]?.hand;
    if(!system || morale <= 0 || !legacyMoralePenaltyActive(seat,40) || !Array.isArray(hand) || !hand.length) return null;
    const index = Math.floor(Math.random()*hand.length);
    const card = hand.splice(Math.max(0,Math.min(hand.length-1,index)),1)[0];
    if(!card) return null;
    if(typeof window.fatePushDiscard === 'function') window.fatePushDiscard(seat,card,{sound:false});
    else if(typeof fatePushDiscard === 'function') fatePushDiscard(seat,card,{sound:false});
    if(typeof playDiscardSfx === 'function') playDiscardSfx();
    return {
      type:'MORALE_40_HAND_DISCARDED',
      playerIndex:seat,
      cardIid:String(card.iid || ''),
      cardId:String(card.id || ''),
      cardName:String(card.name || 'Card'),
      threshold:40,
      reason:'MORALE_40_RANDOM_HAND_DISCARD'
    };
  }

  function heartSvg(){
    return '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 28S4 21 4 11.5C4 6.8 9.7 4 13.2 7.2L16 9.8l2.8-2.6C22.3 4 28 6.8 28 11.5 28 21 16 28 16 28Z"/></svg>';
  }

  function sealSvg(){
    return '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3 26 8v10L16 29 6 18V8L16 3Z"/><path d="m16 8 5 3v6l-5 6-5-6v-6l5-3Z"/></svg>';
  }

  function pressureSvg(){
    return '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="m18 2-9 16h7l-2 12 10-18h-7l1-10Z"/></svg>';
  }

  function ensureHud(){
    const game = document.getElementById('s-game');
    if(!game) return null;
    const rebuildHost = window.FATE_MATCH_UI_REBUILD_ENABLED !== false
      ? document.querySelector('#fate-match-command-deck [data-match-slot="morale-status"]')
      : null;
    const host = rebuildHost || game.querySelector('.topbar') || game;
    let root = document.getElementById(HUD_ID);
    if(!root){
      root = document.createElement('div');
      root.id = HUD_ID;
      root.className = 'morale-pressure-hud';
      root.innerHTML = '<section class="mp-player mp-left" data-seat="0"></section>' +
        '<button type="button" id="' + STATUS_ID + '-player" class="mp-status-summary mp-status-player effect-pill-mine" data-status-owner="player" aria-expanded="false">' +
          '<span class="mp-status-icon effect-pill-icon" aria-hidden="true">&#9670;</span><span class="effect-pill-label">Status Effects</span><b>0</b><div class="mp-status-popover"></div>' +
        '</button>' +
        '<button type="button" id="' + STATUS_ID + '-opponent" class="mp-status-summary mp-status-opponent effect-pill-opp" data-status-owner="opponent" aria-expanded="false">' +
          '<span class="mp-status-icon effect-pill-icon" aria-hidden="true">&#9670;</span><span class="effect-pill-label">Status Effects</span><b>0</b><div class="mp-status-popover"></div>' +
        '</button>' +
        '<section class="mp-player mp-right" data-seat="1"></section>';
      host.appendChild(root);
      const statuses = Array.from(root.querySelectorAll('.mp-status-summary'));
      statuses.forEach(function(status){
        status.addEventListener('click', function(event){
          event.stopPropagation();
          const willOpen = status.getAttribute('aria-expanded') !== 'true';
          statuses.forEach(function(other){ other.setAttribute('aria-expanded', 'false'); });
          status.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        });
      });
      document.addEventListener('click', function(){ statuses.forEach(function(status){ status.setAttribute('aria-expanded', 'false'); }); });
    }
    if(root.parentElement !== host) host.appendChild(root);
    root.querySelectorAll('.mp-status-summary').forEach(function(summary){
      // Older hot sessions may still carry the generic tooltip pill class.
      // It creates a second surface and can expand into the large empty banner
      // that previously covered the opponent Morale display.
      summary.classList.remove('effect-pill');
    });
    ensureWideBoardLayoutSync();
    if(!statusSummaryObserver && typeof MutationObserver === 'function'){
      const sources = ['tp-status-left','tp-status-right','game-status-dock','game-status-left','game-status-right']
        .map(function(id){ return document.getElementById(id); })
        .filter(Boolean);
      if(sources.length){
        statusSummaryObserver = new MutationObserver(function(){
          if(!root.hidden) renderStatusSummary(root);
        });
        sources.forEach(function(source){
          statusSummaryObserver.observe(source, {childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','aria-label']});
        });
      }
    }
    installZoneFateTooltip();
    return root;
  }

  function ensureZoneFateTooltip(){
    let tooltip = document.getElementById(ZONE_FATE_TOOLTIP_ID);
    if(!tooltip){
      tooltip = document.createElement('div');
      tooltip.id = ZONE_FATE_TOOLTIP_ID;
      tooltip.className = 'morale-zone-fate-tooltip';
      tooltip.setAttribute('role', 'tooltip');
      tooltip.hidden = true;
      document.body.appendChild(tooltip);
    }
    return tooltip;
  }

  function positionZoneFateTooltip(anchor, tooltip){
    const rect = anchor.getBoundingClientRect();
    tooltip.style.left = Math.max(12, Math.min(window.innerWidth - 12, rect.left + rect.width / 2)) + 'px';
    tooltip.style.top = (rect.bottom + 10) + 'px';
    requestAnimationFrame(function(){
      if(tooltip.hidden) return;
      const tipRect = tooltip.getBoundingClientRect();
      let left = rect.left + rect.width / 2 - tipRect.width / 2;
      left = Math.max(12, Math.min(window.innerWidth - tipRect.width - 12, left));
      let top = rect.bottom + 10;
      if(top + tipRect.height > window.innerHeight - 12) top = Math.max(12, rect.top - tipRect.height - 10);
      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';
    });
  }

  function installZoneFateTooltip(){
    if(zoneFateTooltipInstalled) return;
    zoneFateTooltipInstalled = true;
    document.addEventListener('pointerover', function(event){
      const anchor = event.target?.closest?.('.zone-score-card[data-tooltip], #zscore .zs[data-tooltip]');
      const game = document.getElementById('s-game');
      if(!anchor || !(game?.classList.contains('morale-pressure-enabled') || game?.classList.contains('morale-only-enabled'))) return;
      const text = String(anchor.dataset.tooltip || '').trim();
      if(!text) return;
      const tooltip = ensureZoneFateTooltip();
      tooltip.textContent = text;
      tooltip.hidden = false;
      tooltip.classList.add('show');
      positionZoneFateTooltip(anchor, tooltip);
    });
    document.addEventListener('pointerout', function(event){
      const anchor = event.target?.closest?.('.zone-score-card[data-tooltip], #zscore .zs[data-tooltip]');
      if(!anchor || anchor.contains(event.relatedTarget)) return;
      const tooltip = document.getElementById(ZONE_FATE_TOOLTIP_ID);
      if(!tooltip) return;
      tooltip.classList.remove('show');
      tooltip.hidden = true;
    });
  }

  function ledgerTooltip(system, seat){
    const entries = Array.isArray(system.ledger?.[seat]) ? system.ledger[seat] : [];
    if(!entries.length) return '<div class="mp-ledger-empty">No Pressure contributions.</div>';
    return entries.map(function(entry){
      const amount = Number(entry.amount || 0);
      const sign = amount > 0 ? '+' : '';
      const reason = String(entry.reason || '').replaceAll('_', ' ').toLowerCase();
      const affected = Array.isArray(entry.affectedIids) && entry.affectedIids.length
        ? '<small>' + entry.affectedIids.length + ' adjacent card' + (entry.affectedIids.length === 1 ? '' : 's') + ' affected</small>'
        : '';
      return '<div class="mp-ledger-row"><span><strong>' + escapeHtml(entry.sourceName || 'Rule') + '</strong><em>' + escapeHtml(reason) + '</em>' + affected + '</span><b class="' + (amount < 0 ? 'negative' : '') + '">' + sign + amount + '</b></div>';
    }).join('');
  }

  function getCardCurrentPressure(card, explicitSystem){
    if(!card) return 0;
    const system = currentSystem(explicitSystem);
    if(!system) return 0;
    const iid = String(card.iid || '');
    if(!iid) return Math.max(0, Number(card.currentPressure ?? card.pressure ?? 0) || 0);
    let total = 0;
    for(const seat of [0, 1]){
      const entries = Array.isArray(system.ledger?.[seat]) ? system.ledger[seat] : [];
      entries.forEach(function(entry){
        const explicitTarget = String(entry.cardIid || entry.targetIid || '');
        const belongsToCard = explicitTarget
          ? explicitTarget === iid
          : String(entry.sourceIid || '') === iid;
        if(belongsToCard) total += Number(entry.amount || 0);
      });
    }
    return Math.max(0, total);
  }

  function cardPressurePillHtml(card){
    return '';
  }

  function updateVisibleCardPressurePills(system){
    const state = legacyGameState();
    document.querySelectorAll('[data-card-pressure-iid]').forEach(function(node){
      const iid = String(node.getAttribute('data-card-pressure-iid') || '');
      if(!iid) return;
      let card = null;
      try{
        if(typeof window.findBoardCardByIid === 'function') card = window.findBoardCardByIid(iid);
        if(!card && state){
          for(const player of state.players || []){
            card = (player.hand || []).find(function(item){ return String(item?.iid || '') === iid; }) || card;
            card = (player.deck || []).find(function(item){ return String(item?.iid || '') === iid; }) || card;
            card = (player.discard || []).find(function(item){ return String(item?.iid || '') === iid; }) || card;
          }
        }
      }catch(e){}
      node.textContent = getCardCurrentPressure(card || {iid:iid}, system) + ' Pressure';
    });
  }

  function escapeHtml(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(char){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];
    });
  }

  function renderPlayer(root, system, seat, label){
    const morale = Math.max(0, Number(system.morale?.[seat] || 0));
    const max = Math.max(1, Number(system.maxMorale || 200));
    const shield = Math.max(0, Number(system.shields?.[seat] || 0));
    const total = morale + shield;
    const scale = total > max ? max / total : 1;
    const moraleWidth = Math.max(0, Math.min(100, morale * scale / max * 100));
    const shieldWidth = Math.max(0, Math.min(100 - moraleWidth, shield * scale / max * 100));
    const pressure = overridePressure && Number.isFinite(Number(overridePressure[seat]))
      ? Math.max(0, Number(overridePressure[seat]))
      : Math.max(0, Number(system.pressure?.[seat] || 0));
    const seals = Math.max(0, Number(system.seals?.[seat] || 0));
    root.innerHTML = '<div class="mp-heading"><span>' + escapeHtml(label) + '</span><strong>' + morale + ' Morale</strong></div>' +
      '<div class="mp-morale-line" tabindex="0" aria-label="Morale details">' +
        '<span class="mp-heart">' + heartSvg() + '</span>' +
        '<div class="mp-bar"><i class="mp-morale-fill" style="width:' + moraleWidth + '%"></i><i class="mp-shield-fill" style="left:' + moraleWidth + '%;width:' + shieldWidth + '%"></i></div>' +
        '<div class="mp-morale-tip">' + moraleTooltip(system, seat) + '</div>' +
      '</div>' +
      '<div class="mp-resources">' +
        '<button type="button" class="mp-pressure" aria-label="Pressure details"><span>' + pressureSvg() + '</span><b>' + pressure + '</b><em>Pressure</em><div class="mp-pressure-tip">' + ledgerTooltip(system, seat) + '<footer>Total <b>' + pressure + '</b></footer></div></button>' +
        '<div class="mp-seals" title="Seals"><span>' + sealSvg() + '</span><b>' + seals + '</b><em>Seals</em></div>' +
      '</div>';
  }

  function renderSealOnlyPlayer(root, system, seat, label){
    const seals = Math.max(0, Number(system.seals?.[seat] || 0));
    root.innerHTML = '<div class="mp-seal-only-label">' + escapeHtml(label) + '</div>' +
      '<div class="mp-seals" title="' + escapeHtml(label) + ' Seals"><span>' + sealSvg() + '</span><b>' + seals + '</b><em>Seals</em></div>';
  }

  function renderMoraleOnlyPlayer(root, system, seat, label){
    const morale = Math.max(0, Number(system.morale?.[seat] || 0));
    const max = Math.max(1, Number(system.maxMorale || 200));
    const moraleWidth = Math.max(0, Math.min(100, morale / max * 100));
    root.innerHTML = '<div class="mp-heading"><span>' + escapeHtml(label) + '</span><strong>' + morale + ' Morale</strong></div>' +
      '<div class="mp-morale-line" tabindex="0" aria-label="Morale details">' +
        '<span class="mp-heart">' + heartSvg() + '</span>' +
        '<div class="mp-bar"><i class="mp-morale-fill" style="width:' + moraleWidth + '%"></i></div>' +
        '<div class="mp-morale-tip">' + moraleTooltip(system, seat) + '</div>' +
      '</div>';
  }

  function moraleTooltip(system, seat){
    const max = Math.max(1, Number(system?.maxMorale || 200));
    const morale = Math.max(0, Number(system?.morale?.[seat] || 0));
    return '<header><span>Morale</span><b>' + morale + '/' + max + '</b></header>' +
      '<div class="mp-morale-rule active"><b>Every 2 turns, starting Turn 4</b><span>In each zone you do not control, half the Fate difference is dealt as Morale damage (rounded down).</span></div>' +
      '<div class="mp-morale-rule ' + (morale <= max * .8 ? 'active' : '') + '"><b>80% Morale</b><span>Maximum 2 consolidations per turn.</span></div>' +
      '<div class="mp-morale-rule ' + (morale <= max * .6 ? 'active' : '') + '"><b>60% Morale</b><span>Your normal draw phase occurs every other personal turn.</span></div>' +
      '<div class="mp-morale-rule ' + (morale <= max * .4 ? 'active' : '') + '"><b>40% Morale</b><span>At the end of each of your turns, discard 1 random card from your hand.</span></div>' +
      '<div class="mp-morale-rule ' + (morale <= max * .2 ? 'active' : '') + '"><b>20% Morale</b><span>Your Supporters discard themselves after 2 completed turns.</span></div>' +
      '<div class="mp-morale-rule ' + (morale <= 0 ? 'active' : '') + '"><b>0 Morale</b><span>You immediately lose the match.</span></div>' +
      '<div class="mp-morale-rule"><b>Turn 24</b><span>A player with Morale remaining wins by controlling at least 2 of 3 zones.</span></div>';
  }

  function renderStatusSummary(root){
    const summaries = Array.from(root.querySelectorAll('.mp-status-summary'));
    if(!summaries.length) return;
    const pills = Array.from(document.querySelectorAll('#tp-status-left .effect-pill, #tp-status-right .effect-pill, #game-status-dock .effect-pill, #game-status-left .effect-pill, #game-status-right .effect-pill'));
    const unique = [];
    const seen = new Set();
    pills.forEach(function(pill){
      const ability = String(pill.dataset.effectAbility || pill.querySelector('.ept-ability')?.textContent || pill.querySelector('.effect-pill-label')?.textContent || '').trim();
      const description = String(pill.querySelector('.ept-effect')?.textContent || '').replace(/\s+/g, ' ').trim();
      const raw = ability && description ? ability + ': ' + description : (ability || pill.getAttribute('title') || pill.getAttribute('aria-label') || pill.textContent || '');
      const text = String(raw).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').replace(/\s*(?:your\s+effect)\s*\.?\s*$/i, '').trim();
      const opponent = !!pill.closest('#tp-status-right, #game-status-right') || pill.classList.contains('effect-pill-opp');
      const key = (opponent ? 'opp:' : 'you:') + text;
      if(!text || seen.has(key) || pill.classList.contains('effect-pill-overflow')) return;
      seen.add(key);
      const icon = pill.querySelector('.effect-pill-icon');
      const iconHtml = icon ? icon.outerHTML.replace(/\sid=(['"]).*?\1/g, '') : '<span class="effect-pill-icon effect-pill-icon-fallback" aria-hidden="true">&#9670;</span>';
       unique.push({text:text, ability:ability || text, description:description, opponent:opponent, iconHtml:iconHtml});
    });
    summaries.forEach(function(summary){
      const opponent = summary.dataset.statusOwner === 'opponent';
      const entries = unique.filter(function(item){ return item.opponent === opponent; });
      summary.querySelector(':scope > b').textContent = String(entries.length);
      const popover = summary.querySelector('.mp-status-popover');
      popover.innerHTML = entries.length
         ? entries.map(function(item){ return '<div class="mp-status-entry ' + (opponent ? 'opponent' : 'player') + '">' + item.iconHtml + '<span><strong>' + escapeHtml(item.ability) + '</strong><span>' + escapeHtml(item.description || item.text) + '</span></span></div>'; }).join('')
        : '<div class="empty">No active ' + (opponent ? 'opponent ' : '') + 'status effects.</div>';
      summary.classList.toggle('has-effects', entries.length > 0);
    });
  }

  function refreshStatusSummary(){
    const root = document.getElementById(HUD_ID);
    if(!root || root.hidden) return false;
    renderStatusSummary(root);
    return true;
  }

  function renderMoralePressureHud(explicitSystem){
    const system = currentSystem(explicitSystem);
    const game = document.getElementById('s-game');
    if(!game) return false;
    syncWideBoardLayout();
    const root = ensureHud();
    const gameState = legacyGameState();
    const moraleEnabled = window.FATE_MORALE_PRESSURE_RULES_ENABLED === true
      && gameState?._freePlayGameSettings?.healthPressureSeals !== false;
    // The zone-control checkpoint rework also owns a small internal Seal
    // ledger, but that must never mount the experimental Morale/Pressure HUD.
    // With the experiment off, restore the original topbar and status rails in
    // full while checkpoint resolution continues independently.
    if(!system){
      game.classList.remove('morale-pressure-enabled');
      game.classList.remove('morale-only-enabled');
      if(root){
        root.hidden = true;
        root.style.setProperty('display', 'none', 'important');
      }
      document.querySelectorAll('.card-pressure-pill').forEach(function(pill){ pill.remove(); });
      return false;
    }
    if(!moraleEnabled){
      game.classList.remove('morale-pressure-enabled');
      game.classList.remove('morale-only-enabled');
      root.hidden = true;
      root.style.setProperty('display', 'none', 'important');
      root.classList.remove('mp-zone-only', 'mp-seals-only', 'mp-morale-only');
      document.querySelectorAll('.card-pressure-pill').forEach(function(pill){ pill.remove(); });
      return false;
    }
    root.style.removeProperty('display');
    root.hidden = false;
    game.classList.remove('morale-pressure-enabled');
    game.classList.add('morale-only-enabled');
    root.classList.remove('mp-zone-only', 'mp-seals-only');
    root.classList.add('mp-morale-only');
    root.querySelectorAll('.mp-status-summary').forEach(function(summary){
      summary.hidden = false;
      summary.style.removeProperty('display');
    });
    const me = perspectivePlayer();
    const left = root.querySelector('.mp-left');
    const right = root.querySelector('.mp-right');
    left.dataset.seat = String(me);
    right.dataset.seat = String(1 - me);
    renderMoraleOnlyPlayer(left, system, me, 'You');
    renderMoraleOnlyPlayer(right, system, 1 - me, 'Opponent');
    renderStatusSummary(root);
    document.querySelectorAll('.card-pressure-pill, [data-card-pressure-iid]').forEach(function(pill){ pill.remove(); });
    return true;
  }

  function refreshVisibleMatchMoraleSurface(){
    const refreshers=[
      [window.FateMatchUiRebuild,'refresh'],
      [window.FateMatchUiConceptB,'refresh'],
      [window.FateMatchUiConceptC,'refresh'],
      [window.FateMatchUiConceptD,'refresh'],
      [window.FateMatchUiFresh,'refresh'],
      [window.FateMatchUiV8,'refresh'],
      [window.FateAtlasUi,'update'],
      [window.FateCodexUi,'update']
    ];
    refreshers.forEach(function(entry){
      const api=entry[0],method=entry[1];
      if(api&&typeof api[method]==='function')api[method]();
    });
  }

  function commitMoralePresentationValue(working,event){
    const seat=Number(event?.playerIndex);
    if(seat!==0&&seat!==1)return false;
    working.morale[seat]=Number(event?.after||0);
    renderMoralePressureHud(working);
    // The themed shells mirror the hidden canonical HUD. Their interval-based
    // refresh can lag a floater by a quarter second, so refresh synchronously:
    // the new number and the gain/loss floater reach the same browser frame.
    refreshVisibleMatchMoraleSurface();
    // Low-Morale Supporter warnings are board overlays. Repaint the board in
    // this same presentation step so crossing 40% shows them immediately,
    // instead of waiting for the next placement or turn action.
    try{
      if(typeof renderGame === 'function') renderGame({board:true,topbar:false,scores:false,effects:false,hand:false,piles:false,landscape:false});
      else if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.scheduleRender === 'function') window.FateMatchRendererAdapter.scheduleRender('morale-threshold-change');
    }catch(e){}
    return true;
  }

  function findSourceAnchor(iid){
    const wanted = String(iid || '');
    if(!wanted) return null;
    const escaped = window.CSS && typeof window.CSS.escape === 'function' ? window.CSS.escape(wanted) : wanted.replace(/["\\]/g, '\\$&');
    let node = document.querySelector('#board [data-iid="' + escaped + '"]')
      || document.querySelector('#board [data-card-iid="' + escaped + '"]')
      || document.querySelector('#hand-cards [data-fate-v3-hand-iid="' + escaped + '"]')
      || document.querySelector('#hand-cards [data-iid="' + escaped + '"]')
      || document.querySelector('.hand-cards [data-iid="' + escaped + '"]');
    if(node) return node;
    try{
      if(typeof G !== 'undefined' && G && Array.isArray(G.board)){
        for(let z = 0; z < G.board.length; z += 1) for(let r = 0; r < (G.board[z] || []).length; r += 1) for(let c = 0; c < (G.board[z][r] || []).length; c += 1){
          if(String(G.board[z][r][c]?.iid || '') !== wanted) continue;
          return document.querySelector('#board .cell[data-z="' + z + '"][data-r="' + r + '"][data-c="' + c + '"]');
        }
      }
    }catch(e){}
    return null;
  }

  function pressureFloater(event){
    const anchor = findSourceAnchor(event?.sourceIid);
    const hud = document.querySelector('#' + HUD_ID + ' .mp-player[data-seat="' + Number(event?.playerIndex) + '"] .mp-pressure');
    const target = anchor || hud;
    if(!target) return Promise.resolve(false);
    const amount = Number(event?.amount || 0);
    const rect = target.getBoundingClientRect();
    const floater = document.createElement('div');
    floater.className = 'pressure-card-floater' + (amount < 0 ? ' loss' : '');
    floater.textContent = (amount > 0 ? '+' : '') + amount + ' Pressure';
    floater.style.left = (rect.left + rect.width / 2) + 'px';
    floater.style.top = (rect.top + Math.max(18, rect.height * .3)) + 'px';
    document.body.appendChild(floater);
    if(typeof window.playMoralePressureSfx === 'function') window.playMoralePressureSfx(amount < 0 ? 'pressure-loss' : 'pressure-gain');
    return new Promise(function(resolve){
      setTimeout(function(){ floater.remove(); resolve(true); }, 1150);
    });
  }

  function eventSound(event){
    const type = String(event?.type || '').toUpperCase();
    if(type === 'MORALE_DAMAGED') return 'morale-damage';
    if(type === 'MORALE_HEALED') return 'morale-heal';
    if(type === 'MORALE_SHIELD_GAINED') return 'morale-shield-gain';
    if(type === 'MORALE_SHIELD_BROKEN') return 'morale-shield-break';
    if(type === 'SEALS_AWARDED') return 'seal-award';
    if(type === 'SEAL_CHECKPOINT') return 'seal-checkpoint';
    if(type === 'MORALE_BROKEN') return 'morale-break';
    return '';
  }

  function showMoraleLowHandDiscardBanner(event){
    if(typeof window.toast !== 'function' && typeof toast !== 'function') return false;
    const seat = Number(event?.playerIndex);
    const cardName = String(event?.cardName || 'A card');
    const ownSeat = perspectivePlayer();
    const playerName = String((typeof G !== 'undefined' && G?.players?.[seat]?.name) || ('Player ' + (seat+1)));
    const message = seat === ownSeat
      ? 'Low Morale — ' + cardName + ' was randomly discarded from your hand.'
      : 'Low Morale — ' + playerName + ' randomly discarded ' + cardName + ' from their hand.';
    if(typeof window.toast === 'function') window.toast(message,5200);
    else toast(message,5200);
    return true;
  }

  function findMoraleOverlaySource(iid){
    const wanted=String(iid||'');
    let found=null;
    if(!wanted||typeof forEachBoardCard!=='function')return null;
    forEachBoardCard(function(card){if(!found&&card&&String(card.iid||'')===wanted)found=card;});
    return found;
  }

  function moraleEffectSourceDescriptor(card,event){
    return null;
  }

  function flashMoraleEffectSourceOverlay(event){
    return false;
  }

  function flashMoraleCalculationSourceOverlays(cycleEvent){
    if(typeof forEachBoardCard!=='function'||typeof window.flashCardEffect!=='function')return false;
    const descriptors={
      '35':{kind:'alexander_hellenic_glory',label:'Hellenic Glory'},
      '44':{kind:'soviet_grenadiers',label:'The Bears of Russia'}
    };
    const recordedSources=(Array.isArray(cycleEvent&&cycleEvent.moraleDamageSources)?cycleEvent.moraleDamageSources:[])
      .flat()
      .filter(function(source){return source&&Number(source.amount)>0;});
    const contributingIids=new Set(recordedSources.map(function(source){return String(source.sourceIid||'');}).filter(Boolean));
    const hasSourceLedger=Array.isArray(cycleEvent&&cycleEvent.moraleDamageSources);
    let shown=false;
    (Array.isArray(cycleEvent&&cycleEvent.bh18ZoneFateReductions)?cycleEvent.bh18ZoneFateReductions:[]).forEach(function(reduction){
      const source=findMoraleOverlaySource(reduction&&reduction.sourceIid);
      if(!source||source.faceDown===true)return;
      if(typeof isCardVisuallySuppressed==='function'&&isCardVisuallySuppressed(source))return;
      shown=window.flashCardEffect(source,'bh18_genesis_inceldom',{
        label:'The Genesis of all Inceldom',
        soundKey:['morale-calculation','bh18_genesis_inceldom',String(reduction.sourceIid||'bh18'),String(G&&G.turn||0)].join(':')
      })||shown;
    });
    recordedSources.filter(function(source){return String(source.sourceCardId||'')==='34';}).forEach(function(source){
      (Array.isArray(source.affectedIids)?source.affectedIids:[]).forEach(function(iid){
        const target=findMoraleOverlaySource(iid);
        if(!target||target.faceDown===true)return;
        if(typeof isCardVisuallySuppressed==='function'&&isCardVisuallySuppressed(target))return;
        shown=window.flashCardEffect(target,'rozsi_hungarian_crest',{
          label:'Hungarian Dance',
          soundKey:['morale-calculation','rozsi_hungarian_crest',String(source.sourceIid||'34'),String(iid),String(G&&G.turn||0)].join(':')
        })||shown;
      });
    });
    forEachBoardCard(function(card){
      const descriptor=descriptors[String(card&&card.id||'')];
      if(!descriptor||card.faceDown===true)return;
      if(hasSourceLedger&&!contributingIids.has(String(card.iid||'')))return;
      if(typeof isCardVisuallySuppressed==='function'&&isCardVisuallySuppressed(card))return;
      shown=window.flashCardEffect(card,descriptor.kind,{label:descriptor.label,soundKey:['morale-calculation',descriptor.kind,String(card.iid||card.id||''),String(G&&G.turn||0)].join(':')})||shown;
    });
    if(shown&&window.FateMatchRendererAdapter?.renderFromGameState)window.FateMatchRendererAdapter.renderFromGameState({source:'morale-calculation-source-overlays'});
    return shown;
  }

  async function presentMoralePressureEvents(events, view, barrierReserved){
    const list = Array.isArray(events) ? events : [];
    const finalSystem = view?.state?.moralePressure || currentSystem();
    if(!finalSystem) return false;
    const ownsBarrier=!barrierReserved&&moraleCalculationEventPresent(list);
    if(ownsBarrier)beginMoraleCalculationPresentation();
    try{
    const working = JSON.parse(JSON.stringify(finalSystem));
    presentedMoraleSystem=working;
    overridePressure = Array.isArray(working.pressure) ? working.pressure.slice(0, 2) : [0, 0];
    for(let index = list.length - 1; index >= 0; index -= 1){
      const event = list[index] || {};
      const type = String(event.type || '').toUpperCase();
      const seat = Number(event.playerIndex);
      if(seat !== 0 && seat !== 1) continue;
      if(type === 'PRESSURE_CHANGED') overridePressure[seat] = Number.isFinite(Number(event.beforePressure))
        ? Math.max(0, Number(event.beforePressure))
        : Math.max(0, Number(overridePressure[seat] || 0) - Number(event.amount || 0));
      if(type === 'PRESSURE_CYCLE_RESET') overridePressure[seat] = Math.max(0, Number(event.before || 0));
      if(type === 'MORALE_DAMAGED' || type === 'MORALE_HEALED') working.morale[seat] = Number(event.before || 0);
      if(type === 'MORALE_SHIELD_GAINED' || type === 'MORALE_SHIELD_BROKEN') working.shields[seat] = Number(event.before || 0);
      if(type === 'SEALS_AWARDED') working.seals[seat] = Number(event.before || 0);
    }
    working.pressure = overridePressure.slice();
    renderMoralePressureHud(working);
    const moraleCalculation=moraleCalculationEventPresent(list);
    const moraleCycleEvent=list.find(function(event){return String(event&&event.type||'').toUpperCase()==='MORALE_CYCLE_RESOLVED';})||null;
    const activationEventPresent=list.some(function(event){
      const type=String(event&&event.type||'').toUpperCase();
      return type==='EFFECT_ACTIVATED'||type==='EFFECT_REACTED';
    });
    let activationPresentationSettled=false;
    let calculationSourceOverlaysShown=false;
    for(const event of list){
      const type = String(event?.type || '').toUpperCase();
      if(type === 'PRESSURE_CHANGED'){
        const seat = Number(event.playerIndex);
        if(seat === 0 || seat === 1) overridePressure[seat] = Number.isFinite(Number(event.afterPressure))
          ? Math.max(0, Number(event.afterPressure))
          : Math.max(0, Number(overridePressure[seat] || 0) + Number(event.amount || 0));
        working.pressure = overridePressure.slice();
        renderMoralePressureHud(working);
        await pressureFloater(event);
        continue;
      }
      const seat = Number(event.playerIndex);
      const hasSeat = seat === 0 || seat === 1;
      if(hasSeat){
        if(type === 'MORALE_SHIELD_GAINED' || type === 'MORALE_SHIELD_BROKEN') working.shields[seat] = Number(event.after || 0);
        if(type === 'SEALS_AWARDED') working.seals[seat] = Number(event.after || 0);
        if(type === 'PRESSURE_CYCLE_RESET'){
          overridePressure[seat] = Math.max(0, Number(event.after || 0));
          working.pressure = overridePressure.slice();
        }
        if(type !== 'MORALE_DAMAGED' && type !== 'MORALE_HEALED')renderMoralePressureHud(working);
      }
      if((type==='MORALE_DAMAGED'||type==='MORALE_HEALED')&&!moraleCalculation&&!activationPresentationSettled){
        if(event.sourceIid||activationEventPresent||effectActivationPresentationActive())await waitForEffectActivationPresentation(event);
        activationPresentationSettled=true;
      }
      const sound = eventSound(event);
      if(sound && typeof window.playMoralePressureSfx === 'function') window.playMoralePressureSfx(sound);
      if(type === 'PRESSURE_RESOLVED'){
        await showPressureResolution(event);
      }
      if(type === 'MORALE_CYCLE_RESOLVED'){
        // The calculation is already authoritative game state. Keep the HUD
        // number in sync without interrupting play with a calculation modal.
        renderMoralePressureHud(working);
      }
      if(type === 'MORALE_DAMAGED'){
        if(moraleCalculation&&!calculationSourceOverlaysShown){
          // Register every contributing passive overlay and the Morale delta in
          // one browser task so Alexander/Soviet Grenadiers paint in the exact
          // frame where the visible number begins to fall.
          flashMoraleCalculationSourceOverlays(moraleCycleEvent);
          calculationSourceOverlaysShown=true;
        }else if(!moraleCalculation){
          flashMoraleEffectSourceOverlay(event);
        }
        commitMoralePresentationValue(working,event);
        await animateMoraleDamage(event);
      }
      if(type === 'MORALE_HEALED'){
        if(!moraleCalculation)flashMoraleEffectSourceOverlay(event);
        commitMoralePresentationValue(working,event);
        await animateMoraleHeal(event);
      }
      if(type === 'MORALE_SHIELD_GAINED'){
        await animateShieldGain(event);
      }
      if(type === 'MORALE_SUPPORTER_EXPIRED' && typeof window.toast === 'function'){
        window.toast((event.cardName || 'Supporter') + ' discarded itself after two turns at low Morale.');
      }
      if(type === 'MORALE_40_HAND_DISCARDED'){
        showMoraleLowHandDiscardBanner(event);
      }
      if(type === 'DRAW_PHASE_SKIPPED' && event.reason === 'MORALE_60_ALTERNATING_DRAW' && typeof window.toast === 'function'){
        window.toast('Low Morale: this draw phase is skipped. You will draw next turn.');
      }
      if(type === 'SEAL_CHECKPOINT' && typeof window.showMoralePressureCheckpoint === 'function'){
        await window.showMoralePressureCheckpoint(event.report, view);
      }
    }
    overridePressure = null;
    presentedMoraleSystem=null;
    heldMoraleSystem=finalSystem && !sameMoraleValues(currentSystem(),finalSystem)
      ? JSON.parse(JSON.stringify(finalSystem))
      : null;
    renderMoralePressureHud(finalSystem);
    refreshVisibleMatchMoraleSurface();
    return true;
    }finally{
      presentedMoraleSystem=null;
      if(ownsBarrier)endMoraleCalculationPresentation();
    }
  }

  function showPressureResolution(event){
    const pressure = Array.isArray(event?.pressure) ? event.pressure : [0,0];
    const winnerValue = Number(event?.winnerPlayerIndex);
    const winner = winnerValue === 0 || winnerValue === 1 ? winnerValue : null;
    const modal = document.createElement('div');
    modal.className = 'pressure-resolution-reveal';
    modal.innerHTML = '<div class="pressure-resolution-card"><div class="seal-checkpoint-kicker">Pressure Calculation</div><h2>' + (winner == null ? 'Pressure Tied' : 'Player ' + (Number(winner)+1) + ' Prevails') + '</h2><div class="pressure-resolution-values"><div><span>Player 1</span><strong>' + Math.max(0,Number(pressure[0])||0) + '</strong></div><b>vs</b><div><span>Player 2</span><strong>' + Math.max(0,Number(pressure[1])||0) + '</strong></div></div><footer><span>Difference <b>' + Math.max(0,Number(event?.difference)||0) + '</b></span><span>Morale Damage <b>' + Math.max(0,Number(event?.incomingDamage)||0) + '</b></span></footer></div>';
    document.body.appendChild(modal);
    if(typeof window.playMoralePressureSfx === 'function') window.playMoralePressureSfx('seal-checkpoint');
    return new Promise(function(resolve){
      setTimeout(function(){modal.classList.add('show');},20);
      setTimeout(function(){modal.classList.remove('show');setTimeout(function(){modal.remove();resolve(true);},240);},3400);
    });
  }

  function showMoraleCycleResolution(event){
    const zones = Array.isArray(event?.zoneResults) ? event.zoneResults : [];
    const damage = Array.isArray(event?.damage) ? event.damage : [0,0];
    const modal = document.createElement('div');
    modal.className = 'pressure-resolution-reveal morale-cycle-resolution-reveal';
    const rows = [0,1,2].map(function(zone){
      const result = zones.find(function(item){return Number(item?.zone)===zone;}) || {scores:[0,0],difference:0,controller:null};
      const scores = Array.isArray(result.scores) ? result.scores : [0,0];
      const zoneDamage = Math.floor(Math.max(0,Number(result.difference)||0)/2);
      const zoneDamageLabel = typeof window.getBh21ConcealedNumericLabel === 'function' ? window.getBh21ConcealedNumericLabel(zoneDamage) : String(zoneDamage);
      const outcome = result.controller == null ? 'Tied — no damage' : 'Player ' + (Number(result.controller)+1) + ' controls · ' + zoneDamageLabel + ' Morale damage';
      return '<div class="morale-cycle-zone"><span>Zone ' + (zone+1) + '</span><b>' + Math.max(0,Number(scores[0])||0) + ' — ' + Math.max(0,Number(scores[1])||0) + '</b><em>' + outcome + '</em></div>';
    }).join('');
    const damage0 = Math.max(0,Number(damage[0])||0), damage1 = Math.max(0,Number(damage[1])||0);
    const damageLabel0 = typeof window.getBh21ConcealedNumericLabel === 'function' ? window.getBh21ConcealedNumericLabel(damage0) : String(damage0);
    const damageLabel1 = typeof window.getBh21ConcealedNumericLabel === 'function' ? window.getBh21ConcealedNumericLabel(damage1) : String(damage1);
    modal.innerHTML = '<div class="pressure-resolution-card morale-cycle-resolution-card"><div class="seal-checkpoint-kicker">End of Turn Cycle</div><h2>Morale Calculation</h2><div class="morale-cycle-zones">' + rows + '</div><footer><span>Player 1 Damage <b>' + damageLabel0 + '</b></span><span>Player 2 Damage <b>' + damageLabel1 + '</b></span></footer></div>';
    document.body.appendChild(modal);
    if(typeof window.playMoralePressureSfx === 'function') window.playMoralePressureSfx('morale-damage');
    return new Promise(function(resolve){
      setTimeout(function(){modal.classList.add('show');},20);
      setTimeout(function(){modal.classList.remove('show');setTimeout(function(){modal.remove();resolve(true);},240);},3000);
    });
  }

  function animateMoraleDamage(event){
    const root = document.getElementById(HUD_ID);
    const player = root?.querySelector('.mp-player[data-seat="' + Number(event?.playerIndex) + '"]');
    if(!player) return Promise.resolve(false);
    const visiblePlayer = visibleMoralePresentationTarget(event?.playerIndex);
    const floater = document.createElement('div');
    floater.className = 'morale-damage-floater';
    const damageAmount = Math.max(0,Number(event?.amount)||0);
    const damageLabel = typeof window.getBh21ConcealedNumericLabel === 'function' ? window.getBh21ConcealedNumericLabel(damageAmount) : String(damageAmount);
    floater.textContent = '-' + damageLabel + ' Morale';
    positionMoraleFloater(floater,player,event?.playerIndex);
    document.body.appendChild(floater);
    player.classList.remove('mp-morale-hit');
    visiblePlayer?.classList.remove('morale-fx-damage');
    void player.offsetWidth;
    player.classList.add('mp-morale-hit');
    if(visiblePlayer){void visiblePlayer.offsetWidth;visiblePlayer.classList.add('morale-fx-damage');}
    return new Promise(function(resolve){setTimeout(function(){player.classList.remove('mp-morale-hit');visiblePlayer?.classList.remove('morale-fx-damage');floater.remove();resolve(true);},1500);});
  }

  function animateMoraleHeal(event){
    const root = document.getElementById(HUD_ID);
    const player = root?.querySelector('.mp-player[data-seat="' + Number(event?.playerIndex) + '"]');
    if(!player) return Promise.resolve(false);
    const visiblePlayer = visibleMoralePresentationTarget(event?.playerIndex);
    const floater = document.createElement('div');
    floater.className = 'morale-heal-floater';
    const healAmount = Math.max(0,Number(event?.amount)||0);
    const healLabel = typeof window.getBh21ConcealedNumericLabel === 'function' ? window.getBh21ConcealedNumericLabel(healAmount) : String(healAmount);
    floater.textContent = '+' + healLabel + ' Morale';
    positionMoraleFloater(floater,player,event?.playerIndex);
    document.body.appendChild(floater);
    player.classList.remove('mp-morale-heal');
    visiblePlayer?.classList.remove('morale-fx-heal');
    void player.offsetWidth;
    player.classList.add('mp-morale-heal');
    if(visiblePlayer){void visiblePlayer.offsetWidth;visiblePlayer.classList.add('morale-fx-heal');}
    return new Promise(function(resolve){setTimeout(function(){player.classList.remove('mp-morale-heal');visiblePlayer?.classList.remove('morale-fx-heal');floater.remove();resolve(true);},1600);});
  }

  function animateShieldGain(event){
    const root = document.getElementById(HUD_ID);
    const player = root?.querySelector('.mp-player[data-seat="' + Number(event?.playerIndex) + '"]');
    if(!player) return Promise.resolve(false);
    const floater = document.createElement('div');
    floater.className = 'morale-shield-floater';
    floater.textContent = '+' + Math.max(0,Number(event?.amount)||0) + ' Shield';
    positionMoraleFloater(floater,player,event?.playerIndex);
    document.body.appendChild(floater);
    player.classList.remove('mp-shield-gain');
    void player.offsetWidth;
    player.classList.add('mp-shield-gain');
    return new Promise(function(resolve){setTimeout(function(){player.classList.remove('mp-shield-gain');floater.remove();resolve(true);},1050);});
  }

  function visibleMoralePresentationTarget(seat){
    const role = Number(seat) === Number(perspectivePlayer()) ? 'you' : 'opp';
    const visibleMarkers = Array.from(document.querySelectorAll(
      '#fate-codex-ui-v19 [data-morale="' + role + '"], ' +
      '#fate-atlas-ui [data-morale="' + role + '"], ' +
      '#fate-match-ui-v8 [data-morale="' + role + '"], ' +
      '#fate-match-ui-v7 [data-morale="' + role + '"], ' +
      '#fate-match-ui-v6 [data-morale="' + role + '"], ' +
      '#fate-match-ui-v5 [data-morale="' + role + '"], ' +
      '#fate-match-ui-v4 [data-morale-value="' + role + '"], ' +
      '#fate-match-ui-v3 [data-morale="' + role + '"]'
    ));
    return visibleMarkers.map(function(marker){
      return marker.closest('.codex-v19-morale, .atlas-morale, .v8-vital, .nv-morale, .rx-morale, .cr-life, .wb-morale, .fc-vitals') || marker;
    }).find(function(candidate){
      const candidateRect=candidate?.getBoundingClientRect?.();
      return candidateRect&&candidateRect.width>0&&candidateRect.height>0;
    });
  }

  function positionMoraleFloater(floater,player,seat){
    const visiblePlayer = visibleMoralePresentationTarget(seat);
    const visibleAnchor = visiblePlayer?.classList?.contains('codex-v19-morale')
      ? (visiblePlayer.querySelector(':scope > i') || visiblePlayer)
      : visiblePlayer;
    const anchor = visibleAnchor
      ? visibleAnchor
      : (player?.querySelector('.mp-morale-line, .mp-bar') || player);
    const rect = anchor?.getBoundingClientRect?.();
    if(!floater || !rect) return;
    const edgePadding = 92;
    const viewportWidth = Math.max(240,Number(window.innerWidth)||document.documentElement.clientWidth||240);
    const viewportHeight = Math.max(180,Number(window.innerHeight)||document.documentElement.clientHeight||180);
    const centerX = rect.left + rect.width / 2;
    floater.style.left = Math.min(viewportWidth-edgePadding,Math.max(edgePadding,centerX)) + 'px';
    floater.style.top = Math.min(viewportHeight-72,Math.max(18,rect.top + rect.height/2 - 7)) + 'px';
  }

  function showCheckpoint(report){
    if(!report) return Promise.resolve(false);
    const modal = document.createElement('div');
    modal.className = 'seal-checkpoint-reveal';
    const zoneAward = Number(report.awards?.zones || 0);
    const zoneWins = Array.isArray(report.zoneWins) ? report.zoneWins : [0,0];
    const morale = Array.isArray(report.morale) ? report.morale : [0,0];
    modal.innerHTML = '<div class="seal-checkpoint-card"><div class="seal-checkpoint-kicker">Turn ' + Number(report.turn || 0) + ' Checkpoint</div>' +
      '<h2>Seal Assessment</h2><div class="seal-checkpoint-grid">' +
      '<div><span>Zone Control</span><strong>' + (report.zoneLeader == null ? 'Tied' : 'Player ' + (Number(report.zoneLeader) + 1) + ' +' + zoneAward) + '</strong><small>Zones controlled: Player 1 ' + Number(zoneWins[0]||0) + ', Player 2 ' + Number(zoneWins[1]||0) + '.</small></div>' +
      (report.moraleEnabled === false
        ? '<div><span>Morale</span><strong>Rules disabled</strong><small>This match is using the independent zone-control objective rules only.</small></div>'
        : '<div><span>Morale</span><strong>No checkpoint Seals</strong><small>Morale: Player 1 ' + Number(morale[0]||0) + ', Player 2 ' + Number(morale[1]||0) + '. Higher Morale awards 3 Seals only at the end of the game.</small></div>') +
      '</div><footer><span>Seals</span><b>' + Number(report.seals?.[0] || 0) + ' — ' + Number(report.seals?.[1] || 0) + '</b></footer></div>';
    document.body.appendChild(modal);
    return new Promise(function(resolve){
      setTimeout(function(){ modal.classList.add('show'); }, 20);
      setTimeout(function(){ modal.classList.remove('show'); setTimeout(function(){ modal.remove(); resolve(true); }, 280); }, 5000);
    });
  }

  window.renderMoralePressureHud = renderMoralePressureHud;
  window.refreshMoralePressureStatusSummary = refreshStatusSummary;
  window.presentMoralePressureEvents = presentMoralePressureEvents;
  window.showMoralePressureCheckpoint = showCheckpoint;
  window.playMoralePressureSfx = playMoralePressureSfx;
  window.getCardCurrentPressure = getCardCurrentPressure;
  window.getCardPressurePillHTML = cardPressurePillHtml;
  window.getPresentedMoraleSystem = getPresentedMoraleSystem;
  window.releaseMoralePresentationHold = releaseMoralePresentationHold;
  window.initializeLegacyMoralePressure = initializeLegacyMoralePressure;
  window.refreshLegacyMoralePressure = refreshLegacyMoralePressure;
  window.presentLegacyMoraleDelta = presentLegacyMoraleDelta;
  window.recordLegacyMoralePressureCardSet = recordLegacyMoralePressureCardSet;
  window.recordLegacyMoralePressureActivation = recordLegacyMoralePressureActivation;
  window.modifyLegacyCardPressure = modifyLegacyCardPressure;
  window.recordLegacyMoralePressureDraw = recordLegacyMoralePressureDraw;
  window.resolveLegacyMoralePressureTurnEnd = resolveLegacyMoralePressureTurnEnd;
  window.legacyMoraleConsolidationAllowed = legacyMoraleConsolidationAllowed;
  window.recordLegacyMoraleConsolidation = recordLegacyMoraleConsolidation;
  window.resetLegacyMoraleTurnCounters = resetLegacyMoraleTurnCounters;
  window.shouldSkipLegacyMoraleDraw = shouldSkipLegacyMoraleDraw;
  window.addEventListener('fate-authority-v3-single-player-events', function(event){
    const events = event?.detail?.events || [];
    const view = event?.detail?.view || event?.detail?.metadata?.view || null;
    enqueueMoralePressurePresentation(events,view,'Morale/Pressure presentation failed');
  });
})();
