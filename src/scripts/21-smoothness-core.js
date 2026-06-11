// FATES ENTWINED SMOOTHNESS CORE
// Low-risk runtime polish: image decode hints, asset warmup, and frame-friendly DOM hygiene.
(function(){
  if(window.__fateSmoothnessCoreInstalled) return;
  window.__fateSmoothnessCoreInstalled = true;

  const warmCache = new Set();
  const idle = window.requestIdleCallback || function(fn){ return setTimeout(()=>fn({timeRemaining:()=>0}), 180); };
  const pendingImageRoots = new Set();
  let imageFlushScheduled = false;
  let lastVisibilityRecoveryAt = 0;
  let titleWarmupScheduled = false;
  const lifecycleEvents = [];
  let browserThrottleProbeTimer = 0;
  let browserThrottleProbeRunning = false;
  let lastBrowserThrottleNoticeAt = 0;

  function isElectronShell(){
    try{
      if(/[?&]electron=1(?:&|$)/.test(location.search || '')) return true;
      return /Electron/i.test(navigator.userAgent || '');
    }catch(e){
      return false;
    }
  }

  function recordLifecycleEvent(type, extra){
    try{
      const perf = window.__fatePerf = window.__fatePerf || {};
      const item = {
        at: new Date().toISOString(),
        ms: Math.round(performance.now()),
        type: String(type || 'event'),
        screen: getActiveScreenId(),
        hidden: !!document.hidden,
        hasFocus: document.hasFocus ? !!document.hasFocus() : null,
        pageHidden: !!window.__fatePageHidden,
        viewport: {w: window.innerWidth || 0, h: window.innerHeight || 0, dpr: window.devicePixelRatio || 1},
        nativeTimerDelayMs: perf.nativeTimerDelayMs || 0,
        focusThrottled: !!perf.focusThrottled
      };
      if(extra && typeof extra === 'object') Object.assign(item, extra);
      lifecycleEvents.push(item);
      if(lifecycleEvents.length > 80) lifecycleEvents.shift();
      perf.lifecycleEvents = lifecycleEvents;
    }catch(e){}
  }

  function measureBrowserRenderCadence(durationMs){
    return new Promise(function(resolve){
      const duration = Math.max(900, Math.min(3000, Number(durationMs) || 1600));
      const started = performance.now();
      let frames = 0;
      let maxGap = 0;
      let lastFrame = started;
      let active = true;
      function frame(now){
        if(!active) return;
        const gap = now - lastFrame;
        lastFrame = now;
        frames += 1;
        if(gap > maxGap) maxGap = gap;
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
      const timer = window.__fateNativeSetTimeout || window.setTimeout;
      timer(function(){
        active = false;
        const elapsed = Math.max(1, performance.now() - started);
        resolve({
          elapsedMs: Math.round(elapsed),
          frames,
          fps: Math.round(frames * 1000 / elapsed),
          maxGapMs: Math.round(maxGap * 10) / 10
        });
      }, duration);
    });
  }

  function showBrowserThrottleNotice(result, reason){
    const now = performance.now();
    if(now - lastBrowserThrottleNoticeAt < 30000) return;
    lastBrowserThrottleNoticeAt = now;
    const perf = window.__fatePerf = window.__fatePerf || {};
    perf.browserRenderThrottleDetected = true;
    perf.browserRenderThrottleLast = {
      at:new Date().toISOString(),
      reason:reason || '',
      result,
      lifecycleEvents:(perf.lifecycleEvents || lifecycleEvents || []).slice(-12)
    };
    function saveRenderThrottleReloadState(){
      try{
        const g = typeof G !== 'undefined' ? G : null;
        const payload = {
          at:new Date().toISOString(),
          reason:reason || '',
          screen:getActiveScreenId(),
          url:location.href,
          roomCode:g && g._onlineRoomCode ? g._onlineRoomCode : '',
          isOnline:!!(g && g._onlineRoomCode),
          phase:g ? g.phase : '',
          turn:g ? g.turn : null,
          currentPlayer:g ? g.currentPlayer : null,
          localPlayer:g ? g.localPlayerIndex : null
        };
        sessionStorage.setItem('fateRenderThrottleReload', JSON.stringify(payload));
        if(payload.roomCode) sessionStorage.setItem('fateLastOnlineRoomBeforeRenderThrottleReload', payload.roomCode);
      }catch(e){}
    }
    function reloadForBrowserThrottle(){
      saveRenderThrottleReloadState();
      location.reload();
    }
    const notice = document.getElementById('fate-browser-throttle-notice');
    if(notice) notice.remove();
    const autoReload = (function(){ try{ return localStorage.getItem('fateAutoReloadRenderThrottle') === '1'; }catch(e){ return false; } })();
    window.fateReloadForRenderThrottle = reloadForBrowserThrottle;
    if(autoReload){
      saveRenderThrottleReloadState();
      perf.browserRenderThrottleAutoReloadAt = new Date(Date.now() + 2500).toISOString();
      const timer = window.__fateNativeSetTimeout || window.setTimeout;
      timer(function(){ reloadForBrowserThrottle(); }, 2500);
    }
    if(typeof console !== 'undefined') console.warn('[Fate FPS] Browser render throttle detected', perf.browserRenderThrottleLast);
  }

  function scheduleBrowserThrottleProbe(reason){
    if(document.hidden || window.__fatePageHidden) return;
    if(document.hasFocus && !document.hasFocus()) return;
    if(browserThrottleProbeRunning) return;
    const timer = window.__fateNativeSetTimeout || window.setTimeout;
    if(browserThrottleProbeTimer) clearTimeout(browserThrottleProbeTimer);
    browserThrottleProbeTimer = timer(async function(){
      browserThrottleProbeTimer = 0;
      if(document.hidden || window.__fatePageHidden) return;
      if(document.hasFocus && !document.hasFocus()) return;
      browserThrottleProbeRunning = true;
      try{
        const result = await measureBrowserRenderCadence(1800);
        const perf = window.__fatePerf = window.__fatePerf || {};
        perf.browserRenderThrottleLastProbe = {
          at:new Date().toISOString(),
          reason:reason || '',
          result
        };
        const onlineModulesLoading = !!(window.__fateOnlineModuleState && window.__fateOnlineModuleState.loading);
        const noHeavyGameRender = !(perf.renderSamples && perf.renderSamples.length);
        if(result.fps > 0 && result.fps <= 24 && result.maxGapMs >= 45 && noHeavyGameRender && !onlineModulesLoading && !document.hidden && (!document.hasFocus || document.hasFocus())){
          showBrowserThrottleNotice(result, reason);
        }
      }catch(e){}
      browserThrottleProbeRunning = false;
    }, 1200);
  }

  function installVisibleTimerBridge(){
    if(window.__fateVisibleTimerBridgeInstalled) return;
    if(typeof window.requestAnimationFrame !== 'function') return;
    window.__fateVisibleTimerBridgeInstalled = true;

    // Firefox can get into a visible-but-throttled state where rAF continues at
    // about 12fps but normal timers are delayed by seconds. Do not bridge timers
    // during healthy play; only rescue overdue short one-shot timeouts while that
    // throttled state is detected.
    const nativeSetTimeoutRescue = window.setTimeout.bind(window);
    const nativeClearTimeoutRescue = window.clearTimeout.bind(window);
    const nativeSetIntervalRescue = window.setInterval.bind(window);
    const nativeClearIntervalRescue = window.clearInterval.bind(window);

    function bridgeOptedIn(){
      try{
        return localStorage.getItem('fateTimerBridgeEnabled') === '1'
          && localStorage.getItem('fateDisableTimerBridge') !== '1';
      }catch(e){ return false; }
    }

    if(!bridgeOptedIn()){
      let lastNativeProbe = performance.now();
      let lastProbeDelay = 0;
      window.__fateNativeSetTimeout = nativeSetTimeoutRescue;
      window.__fateNativeSetInterval = nativeSetIntervalRescue;
      window.fateTimerBridgeReport = function(){
        return {
          enabled:false,
          installed:false,
          mode:'opt-in-only',
          nativeTimerDelayMs: Math.round(lastProbeDelay * 10) / 10,
          activeTasks: 0,
          note:'Timer bridge is disabled by default because it caused FPS variance during normal play.'
        };
      };
      window.fateActivateTimerRescue = function(){ return false; };
      window.fateNormalizeBridgeTimers = function(){ return 0; };
      window.fateDisableTimerBridge = function(){
        try{
          localStorage.removeItem('fateTimerBridgeEnabled');
          localStorage.setItem('fateDisableTimerBridge', '1');
        }catch(e){}
        console.warn('[Fate FPS] timer bridge disabled. Refresh to keep native timers.');
      };
      window.fateEnableTimerBridge = function(){
        try{
          localStorage.setItem('fateTimerBridgeEnabled', '1');
          localStorage.removeItem('fateDisableTimerBridge');
        }catch(e){}
        console.warn('[Fate FPS] timer bridge opt-in enabled. Refresh to apply.');
      };
      nativeSetIntervalRescue(function(){
        const now = performance.now();
        lastProbeDelay = Math.max(0, now - lastNativeProbe - 1000);
        lastNativeProbe = now;
        const perf = window.__fatePerf = window.__fatePerf || {};
        perf.nativeTimerDelayMs = Math.round(lastProbeDelay * 10) / 10;
        perf.timerRescueActive = false;
        perf.timerBridgeActiveTasks = 0;
        perf.timerBridgeMaxDriftMs = 0;
      }, 1000);
      return;
    }

    const rescueTasks = new Map();
    let rescueNextId = 800000000;
    let rescueRafId = 0;
    let rescueRunning = false;
    let rescueActiveUntil = 0;
    let rescueFired = 0;
    let rescueLastNativeProbe = performance.now();
    let rescueNativeDelay = 0;
    const rescueMaxDelay = 12000;

    function nativeTimersLagging(){
      return rescueNativeDelay > 450;
    }

    function rescueDisabled(){
      try{ return localStorage.getItem('fateDisableTimerBridge') === '1'; }catch(e){ return false; }
    }

    function rescueIsActive(){
      return !rescueDisabled() && !document.hidden && document.hasFocus() && performance.now() < rescueActiveUntil;
    }

    function activateTimerRescue(reason, duration){
      if(rescueDisabled()) return;
      if(document.hidden || !document.hasFocus()) return;
      const now = performance.now();
      rescueActiveUntil = Math.max(rescueActiveUntil, now + (duration || 5000));
      const perf = window.__fatePerf = window.__fatePerf || {};
      perf.timerRescueActive = true;
      perf.timerRescueReason = reason || 'timer-delay';
      scheduleRescueLoop();
    }

    function scheduleRescueLoop(){
      if(rescueRunning || !rescueTasks.size || !rescueIsActive()) return;
      rescueRunning = true;
      rescueRafId = requestAnimationFrame(runRescueLoop);
    }

    function finishRescueTask(id, task, now, source){
      if(!task || task.done) return;
      task.done = true;
      rescueTasks.delete(id);
      nativeClearTimeoutRescue(task.nativeId);
      rescueFired += 1;
      const perf = window.__fatePerf = window.__fatePerf || {};
      perf.timerRescueFired = rescueFired;
      perf.timerRescueLastDriftMs = Math.round((now - task.due) * 10) / 10;
      perf.timerRescueLastSource = source;
      try{ task.cb.apply(window, task.args); }
      catch(err){ nativeSetTimeoutRescue(function(){ throw err; }, 0); }
    }

    function runRescueLoop(now){
      rescueRunning = false;
      if(!rescueIsActive()){
        const perf = window.__fatePerf = window.__fatePerf || {};
        perf.timerRescueActive = false;
        return;
      }
      let processed = 0;
      rescueTasks.forEach(function(task, id){
        if(processed >= 10 || task.done) return;
        if(now + 1 < task.due) return;
        processed += 1;
        finishRescueTask(id, task, now, 'raf-rescue');
      });
      scheduleRescueLoop();
    }

    function shouldTrackTimeout(cb, delay){
      if(typeof cb !== 'function') return false;
      const ms = Math.max(0, Number(delay) || 0);
      return Number.isFinite(ms) && ms <= rescueMaxDelay;
    }

    window.setTimeout = function(cb, delay){
      const args = Array.prototype.slice.call(arguments, 2);
      if(!shouldTrackTimeout(cb, delay)){
        return nativeSetTimeoutRescue(cb, delay, ...args);
      }
      const ms = Math.max(0, Number(delay) || 0);
      const id = rescueNextId++;
      const task = {
        cb,
        args,
        due: performance.now() + ms,
        done:false,
        nativeId:0
      };
      task.nativeId = nativeSetTimeoutRescue(function(){
        finishRescueTask(id, task, performance.now(), 'native');
      }, delay);
      rescueTasks.set(id, task);
      if(rescueIsActive()) scheduleRescueLoop();
      return id;
    };

    window.clearTimeout = function(id){
      if(rescueTasks.has(id)){
        const task = rescueTasks.get(id);
        task.done = true;
        rescueTasks.delete(id);
        nativeClearTimeoutRescue(task.nativeId);
        return;
      }
      nativeClearTimeoutRescue(id);
    };

    window.__fateNativeSetTimeout = nativeSetTimeoutRescue;
    window.__fateNativeSetInterval = nativeSetIntervalRescue;
    window.fateActivateTimerRescue = activateTimerRescue;
    window.fateTimerBridgeReport = function(){
      return {
        enabled:true,
        installed:true,
        mode:'adaptive-timeout-rescue',
        active: rescueIsActive(),
        activeTasks: rescueTasks.size,
        fired: rescueFired,
        nativeTimerDelayMs: Math.round(rescueNativeDelay * 10) / 10,
        activeMsRemaining: Math.max(0, Math.round(rescueActiveUntil - performance.now())),
        note:'Native timers are used normally; overdue short timeouts are rescued only during Firefox low-FPS timer throttling.'
      };
    };
    window.fateDisableTimerBridge = function(){
      rescueActiveUntil = 0;
      if(rescueRafId) cancelAnimationFrame(rescueRafId);
      rescueRunning = false;
      try{ localStorage.setItem('fateDisableTimerBridge', '1'); }catch(e){}
      console.warn('[Fate FPS] adaptive timer rescue disabled for this page session.');
    };
    window.fateEnableTimerBridge = function(){
      try{ localStorage.removeItem('fateDisableTimerBridge'); }catch(e){}
      activateTimerRescue('manual', 8000);
      console.warn('[Fate FPS] adaptive timer rescue activated for 8s.');
    };
    window.fateNormalizeBridgeTimers = function(){
      if(nativeTimersLagging()) activateTimerRescue('normalize', 4000);
      return rescueTasks.size;
    };

    nativeSetIntervalRescue(function(){
      const now = performance.now();
      rescueNativeDelay = Math.max(0, now - rescueLastNativeProbe - 1000);
      rescueLastNativeProbe = now;
      const perf = window.__fatePerf = window.__fatePerf || {};
      perf.nativeTimerDelayMs = Math.round(rescueNativeDelay * 10) / 10;
      perf.timerRescueActive = rescueIsActive();
      perf.timerBridgeActiveTasks = rescueTasks.size;
      perf.timerBridgeMaxDriftMs = perf.timerRescueLastDriftMs || 0;
      if(nativeTimersLagging() && !document.hidden && document.hasFocus()){
        activateTimerRescue('native-delay-' + Math.round(rescueNativeDelay), 6000);
      }
    }, 1000);

    return;

    function bridgeOptedIn(){
      try{ return localStorage.getItem('fateTimerBridgeEnabled') === '1'; }catch(e){ return false; }
    }

    if(!bridgeOptedIn()){
      window.fateTimerBridgeReport = function(){
        return {
          enabled:false,
          installed:false,
          mode:'opt-in-only',
          note:'Timer bridge is disabled by default because it caused FPS variance during normal play.'
        };
      };
      window.fateDisableTimerBridge = function(){
        try{
          localStorage.removeItem('fateTimerBridgeEnabled');
          localStorage.setItem('fateDisableTimerBridge', '1');
        }catch(e){}
        console.warn('[Fate FPS] rAF timer bridge disabled. Refresh to keep native timers.');
      };
      window.fateEnableTimerBridge = function(){
        try{
          localStorage.setItem('fateTimerBridgeEnabled', '1');
          localStorage.removeItem('fateDisableTimerBridge');
        }catch(e){}
        console.warn('[Fate FPS] rAF timer bridge opt-in enabled. Refresh to apply.');
      };
      window.fateNormalizeBridgeTimers = function(){ return 0; };
      return;
    }

    const nativeSetTimeout = window.setTimeout.bind(window);
    const nativeClearTimeout = window.clearTimeout.bind(window);
    const nativeSetInterval = window.setInterval.bind(window);
    const nativeClearInterval = window.clearInterval.bind(window);
    const maxBridgeDelay = 12000;
    const tasks = new Map();
    let nextId = 1000000000;
    let rafId = 0;
    let running = false;
    let fired = 0;
    let maxDrift = 0;
    let lastNativeProbe = performance.now();
    let lastProbeDelay = 0;

    function isVisibleTimerBridgeEnabled(){
      try{
        if(localStorage.getItem('fateTimerBridgeEnabled') !== '1') return false;
        if(localStorage.getItem('fateDisableTimerBridge') === '1') return false;
      }catch(e){}
      return true;
    }

    function shouldBridge(delay, repeat){
      if(!isVisibleTimerBridgeEnabled()) return false;
      if(repeat) return false;
      const ms = Math.max(0, Number(delay) || 0);
      return Number.isFinite(ms) && ms <= maxBridgeDelay;
    }

    function scheduleLoop(){
      if(running || !tasks.size) return;
      running = true;
      rafId = requestAnimationFrame(tick);
    }

    function tick(now){
      running = false;
      if(!tasks.size) return;
      let processed = 0;
      tasks.forEach(function(task, id){
        if(task.canceled || processed >= 16) return;
        if(now + 0.5 < task.due) return;
        const overdue = now - task.due;
        if(overdue > 1500 && !task.normalized){
          task.normalized = true;
          task.due = now + 20 + processed * 18;
          return;
        }
        processed += 1;
        fired += 1;
        maxDrift = Math.max(maxDrift, now - task.due);
        if(task.repeat){
          task.due = now + task.interval;
        } else {
          tasks.delete(id);
        }
        try{ task.cb.apply(window, task.args); }catch(err){ nativeSetTimeout(function(){ throw err; }, 0); }
      });
      if(tasks.size) scheduleLoop();
    }

    function addTask(cb, delay, repeat, args){
      if(typeof cb !== 'function' || !shouldBridge(delay, repeat)){
        return repeat ? nativeSetInterval(cb, delay, ...args) : nativeSetTimeout(cb, delay, ...args);
      }
      const ms = Math.max(0, Number(delay) || 0);
      const id = nextId++;
      tasks.set(id, {
        cb,
        args,
        repeat,
        delay:ms,
        interval:Math.max(16, ms),
        due:performance.now() + ms,
        canceled:false
      });
      scheduleLoop();
      return id;
    }

    window.setTimeout = function(cb, delay){
      return addTask(cb, delay, false, Array.prototype.slice.call(arguments, 2));
    };
    window.setInterval = function(cb, delay){
      return addTask(cb, delay, true, Array.prototype.slice.call(arguments, 2));
    };
    window.clearTimeout = function(id){
      if(tasks.has(id)){
        const task = tasks.get(id);
        task.canceled = true;
        tasks.delete(id);
      }
      nativeClearTimeout(id);
    };
    window.clearInterval = function(id){
      if(tasks.has(id)){
        const task = tasks.get(id);
        task.canceled = true;
        tasks.delete(id);
      }
      nativeClearInterval(id);
    };

    window.__fateNativeSetTimeout = nativeSetTimeout;
    window.__fateNativeSetInterval = nativeSetInterval;
    window.fateTimerBridgeReport = function(){
      return {
        enabled: isVisibleTimerBridgeEnabled(),
        activeTasks: tasks.size,
        fired,
        maxDriftMs: Math.round(maxDrift * 10) / 10,
        lastNativeProbeDelayMs: Math.round(lastProbeDelay * 10) / 10,
        maxBridgeDelay
      };
    };
    window.fateDisableTimerBridge = function(){
      try{
        localStorage.removeItem('fateTimerBridgeEnabled');
        localStorage.setItem('fateDisableTimerBridge', '1');
      }catch(e){}
      tasks.clear();
      if(rafId) cancelAnimationFrame(rafId);
      running = false;
      console.warn('[Fate FPS] rAF timer bridge disabled. Refresh to return to native timers.');
    };
    window.fateEnableTimerBridge = function(){
      try{
        localStorage.setItem('fateTimerBridgeEnabled', '1');
        localStorage.removeItem('fateDisableTimerBridge');
      }catch(e){}
      console.warn('[Fate FPS] rAF timer bridge enabled. Refresh to apply cleanly.');
    };
    window.fateNormalizeBridgeTimers = function(){
      const now = performance.now();
      let i = 0;
      tasks.forEach(function(task){
        if(task.canceled) return;
        if(task.due < now){
          task.normalized = true;
          task.due = now + 25 + i * 20;
          i += 1;
        }
      });
      scheduleLoop();
      return i;
    };

    nativeSetInterval(function(){
      const now = performance.now();
      lastProbeDelay = Math.max(0, now - lastNativeProbe - 1000);
      lastNativeProbe = now;
      const perf = window.__fatePerf = window.__fatePerf || {};
      perf.nativeTimerDelayMs = Math.round(lastProbeDelay * 10) / 10;
      perf.timerBridgeActiveTasks = tasks.size;
      perf.timerBridgeMaxDriftMs = Math.round(maxDrift * 10) / 10;
    }, 1000);
  }

  function getActiveScreenId(){
    const active = document.querySelector('.screen.active');
    return active ? active.id || '' : '';
  }

  function installRafMonitor(){
    if(window.__fateRafMonitorInstalled || typeof window.requestAnimationFrame !== 'function') return;
    window.__fateRafMonitorInstalled = true;
    const perf = window.__fatePerf = window.__fatePerf || {};
    perf.rafMonitorEnabled = true;
    const originalRaf = window.requestAnimationFrame.bind(window);
    let rafCalls = 0;
    // Lightweight wrapper — only increments an integer. The expensive bookkeeping
    // (perf object access, Math.max, performance.now) was previously done on EVERY
    // rAF call and added measurable overhead at high rAF rates. A 1-second sampler
    // does it once per second instead.
    window.requestAnimationFrame = function(cb){
      rafCalls += 1;
      return originalRaf(cb);
    };
    window.requestAnimationFrame.__fateOriginalRaf = originalRaf;
    setInterval(function(){
      const perf = window.__fatePerf = window.__fatePerf || {};
      perf.rafCallsPerSecond = rafCalls;
      perf.rafCallsPeak = Math.max(perf.rafCallsPeak || 0, rafCalls);
      rafCalls = 0;
    }, 1000);
  }

  window.fateEnableRafMonitor = function(){
    try{ localStorage.setItem('fateRafMonitorEnabled', '1'); }catch(e){}
    installRafMonitor();
    console.warn('[Fate FPS] rAF monitor enabled for this session.');
  };

  function optimizeImage(img){
    if(!img || img.__fateSmoothImg) return;
    img.__fateSmoothImg = true;
    try{ img.decoding = 'async'; }catch(e){}
    try{
      const inGame = !!(img.closest && img.closest('#s-game'));
      img.loading = inGame ? 'eager' : 'lazy';
      img.fetchPriority = inGame ? 'high' : 'low';
      img.draggable = false;
    }catch(e){}
    img.addEventListener('error', function(){
      if(!img.dataset.fateFallbackApplied && img.getAttribute('src') !== 'blank.png'){
        img.dataset.fateFallbackApplied = '1';
        img.src = 'blank.png';
      }
    }, {once:true});
  }

  function optimizeImages(root){
    const base = root && root.querySelectorAll ? root : document;
    base.querySelectorAll('img').forEach(optimizeImage);
  }

  window.fateOptimizeImage = optimizeImage;
  window.fateOptimizeImages = optimizeImages;

  function scheduleOptimizeImages(root){
    if(root){
      const coarseRoot = getRelevantImageRoot(root);
      if(coarseRoot) pendingImageRoots.add(coarseRoot);
    }
    if(imageFlushScheduled) return;
    imageFlushScheduled = true;
    // Use setTimeout 250ms instead of rAF — image optimization (setting decoding,
    // loading, fetchPriority hints) does not need to happen on the next frame.
    // The previous rAF debounce caused this scheduler to fire ~60 times/second on
    // the title screen because the MutationObserver watching the whole document
    // tree fires on every DOM change (notifications, badges, presence callbacks).
    // The 250ms throttle drops that to ~4/sec while still feeling instant.
    setTimeout(function(){
      imageFlushScheduled = false;
      const roots = Array.from(pendingImageRoots);
      pendingImageRoots.clear();
      roots.forEach(function(node){
        if(!node || node.nodeType !== 1) return;
        if(node.tagName === 'IMG') optimizeImage(node);
        else optimizeImages(node);
      });
    }, 250);
  }

  function getRelevantImageRoot(node){
    if(!node || node.nodeType !== 1) return null;
    if(node.tagName === 'IMG') return node;
    if(node.closest){
      return node.closest('#board') ||
        node.closest('#hand-cards') ||
        node.closest('#opp-hand') ||
        node.closest('#modal') ||
        node.closest('#s-game') ||
        node.closest('#s-title') ||
        node.closest('#s-challenger') ||
        node.closest('#world-chat-widget') ||
        node.closest('#ingame-chat-widget');
    }
    return node;
  }

  function isHighChurnGameRoot(root){
    if(!root || root.nodeType !== 1 || !root.closest) return false;
    return !!root.closest('#board,#hand-cards,#opp-hand');
  }

  function getRenderImageRoot(name){
    if(name === 'renderBoard') return document.getElementById('board');
    if(name === 'renderHand') return document.getElementById('hand-cards');
    if(name === 'renderOppHand') return document.getElementById('opp-hand');
    return null;
  }

  function warmImage(src){
    if(!src || warmCache.has(src)) return;
    if(typeof FATE_BACKGROUND_URL === 'function' && /backgrounds|titlscreenbackgrounds|ingamebackgrouds/.test(src)) src = FATE_BACKGROUND_URL(src);
    if(warmCache.has(src)) return;
    warmCache.add(src);
    const img = new Image();
    try{ img.decoding = 'async'; }catch(e){}
    img.src = src;
    if(typeof img.decode === 'function') img.decode().catch(()=>{});
  }

  function warmGameAssets(){
    idle(function(){
      try{
        const g = (typeof G !== 'undefined' && G) ? G : null;
        const active = [];
        if(g && Array.isArray(g.players)){
          g.players.forEach(function(p){
            active.push(...((p.hand || []).slice(0, 12)));
            active.push(...((p.deck || []).slice(0, 10)));
            active.push(...((p.discard || []).slice(-4)));
          });
          (g.board || []).forEach(function(zone){ (zone || []).forEach(function(row){ (row || []).forEach(function(card){ if(card) active.push(card); }); }); });
        }
        active.forEach(card=>{
          if(!card || !card.img) return;
          const src = typeof window.getRuntimeCardImageSrc === 'function' ? window.getRuntimeCardImageSrc(card.img, 'thumb') : card.img;
          warmImage(src);
        });
        active.slice(0, 36).forEach(card=>{
          if(card && card.img) warmImage(card.img);
        });
      }catch(e){}
      ['blank.png','back.png','deck.png'].forEach(warmImage);
    });
  }

  function collectInitialAssets(){
    const assets = new Set(['blank.png','back.png','deck.png','booster1.png','pfpbooster.png']);
    for(let i = 1; i <= 5; i++) assets.add(`optimized/backgrounds/titlscreenbackgrounds_bg${i}.jpg`);
    for(let i = 1; i <= 12; i++) assets.add(`optimized/backgrounds/ingamebackgrouds_igb${i}.jpg`);
    ['root_play1.jpg','root_play2.jpg','root_booster1.jpg','root_pfpbooster.jpg'].forEach(name=>assets.add(`optimized/backgrounds/${name}`));
    for(let i = 1; i <= 18; i++) assets.add(`aiicons/ai${i}.png`);
    for(let i = 1; i <= 24; i++) assets.add(`pfp/pfp${i}.png`);
    // Do not block the title/game transition on the entire card library. Active
    // match cards are warmed by warmGameAssets(), and in-game cards now fall back
    // to original PNGs if a thumbnail stalls.
    return Array.from(assets).filter(Boolean);
  }

  function showInitialLoadingScreen(total){
    if(document.getElementById('fate-loading-screen')) return;
    const cloudOverlay = window.__fateCloudLoadingActive ? document.getElementById('cloud-loading-overlay') : null;
    if(cloudOverlay){
      cloudOverlay.id = 'fate-loading-screen';
      cloudOverlay.classList.add('fate-loading-cloud');
      return;
    }
    const overlay = document.createElement('div');
    overlay.id = 'fate-loading-screen';
    overlay.className = 'fate-loading-screen';
    overlay.innerHTML = `
      <div class="fate-loading-panel">
        <div class="fate-loading-kicker">Fates Entwined</div>
        <div class="fate-loading-title">Loading Assets</div>
        <div class="fate-loading-copy">Preparing cards, portraits, backgrounds, and match UI.</div>
        <div class="fate-loading-bar"><div id="fate-loading-fill"></div></div>
        <div class="fate-loading-count" id="fate-loading-count">0 / ${total}</div>
      </div>`;
    document.body.appendChild(overlay);
  }

  function updateInitialLoadingScreen(done, total){
    const fill = document.getElementById('fate-loading-fill');
    const count = document.getElementById('fate-loading-count');
    const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 100;
    if(fill) fill.style.width = pct + '%';
    if(count) count.textContent = `${done} / ${total}`;
  }

  function hideInitialLoadingScreen(){
    const overlay = document.getElementById('fate-loading-screen');
    if(!overlay) return;
    if(window.__fateCloudLoadingActive){
      overlay.classList.add('fate-loading-assets-done');
      return;
    }
    overlay.classList.add('is-hiding');
    setTimeout(()=>overlay.remove(), 280);
  }

  function preloadImage(src, options){
    const opts = options || {};
    return new Promise(resolve=>{
      const img = new Image();
      let done = false;
      const finish = ()=>{
        if(done) return;
        done = true;
        resolve(src);
      };
      const timer = setTimeout(finish, Number(opts.timeoutMs) || 3500);
      img.onload = ()=>{ clearTimeout(timer); finish(); };
      img.onerror = ()=>{ clearTimeout(timer); finish(); };
      try{ img.decoding = 'async'; }catch(e){}
      img.src = src;
      if(typeof img.decode === 'function') img.decode().then(()=>{ clearTimeout(timer); finish(); }).catch(()=>{});
    });
  }

  function preloadInitialAssets(options){
    const opts = options || {};
    const background = !!opts.background;
    if(window.__fateInitialAssetsPreloaded) return Promise.resolve();
    window.__fateInitialAssetsPreloaded = true;
    const assets = collectInitialAssets();
    const total = assets.length;
    let done = 0;
    if(!background) {
      showInitialLoadingScreen(total);
      updateInitialLoadingScreen(done, total);
    }
    const startedAt = performance.now();
    let lastLoadingPaintAt = startedAt;
    let lastLoadingPaintDone = 0;
    function maybePaintLoadingProgress(force){
      if(background) return;
      const now = performance.now();
      if(force || done === total || done - lastLoadingPaintDone >= 5 || now - lastLoadingPaintAt >= 90){
        lastLoadingPaintAt = now;
        lastLoadingPaintDone = done;
        updateInitialLoadingScreen(done, total);
      }
    }
    const electronShell = isElectronShell();
    const workerCount = background
      ? Math.min(electronShell ? 1 : 3, total)
      : Math.min(electronShell ? 6 : 10, total);
    const workers = Array.from({length:workerCount}, async function(){
      while(assets.length){
        const src = assets.shift();
        await preloadImage(src, {timeoutMs:background ? 1800 : 3500});
        warmCache.add(src);
        done += 1;
        maybePaintLoadingProgress(false);
        if(background && done % 4 === 0) await new Promise(resolve=>setTimeout(resolve, 0));
      }
    });
    const minTime = background ? Promise.resolve() : new Promise(resolve=>setTimeout(resolve, 650));
    const hardStop = new Promise(resolve=>setTimeout(resolve, background ? 6500 : 9000));
    return Promise.race([Promise.all(workers), hardStop])
      .then(()=>minTime)
      .then(()=>{
        if(performance.now() - startedAt > 150) {
          done = total;
          maybePaintLoadingProgress(true);
        }
        if(!background) hideInitialLoadingScreen();
      });
  }

  function warmTitleOpenAssets(){
    if(titleWarmupScheduled) return;
    titleWarmupScheduled = true;
    idle(function(){
      try{
        ['blank.png','back.png','deck.png','booster1.png','pfpbooster.png'].forEach(warmImage);
        const profileSrc = (typeof window.getProfileImgSrc === 'function' ? window.getProfileImgSrc() : '')
          || (typeof window.resolveProfileImgSrc === 'function' && window.USER_PROFILE ? window.resolveProfileImgSrc(window.USER_PROFILE.profileImg) : '');
        if(profileSrc) warmImage(profileSrc);
        if(typeof window.dailyLoginBackgroundForDate === 'function') warmImage(window.dailyLoginBackgroundForDate());
        if(typeof window.fateWarmMenuAudioSamples === 'function') window.fateWarmMenuAudioSamples();
      }catch(e){}
    });
  }

  function scheduleBackgroundInitialPreload(){
    const timer = window.__fateNativeSetTimeout || window.setTimeout;
    const electronShell = isElectronShell();
    const initialDelay = electronShell ? 12000 : 2600;
    timer(function(){
      idle(function(){
        if(electronShell && getActiveScreenId() !== 's-title') return;
        if(document.getElementById('modal')?.classList.contains('on')) {
          timer(function(){ preloadInitialAssets({background:true}); }, electronShell ? 5000 : 1400);
          return;
        }
        preloadInitialAssets({background:true});
      });
    }, initialDelay);
  }

  function installMatchWarmup(){
    if(window.__fateSmoothStartWarmupInstalled) return;
    window.__fateSmoothStartWarmupInstalled = true;
    const origStart = window.startGame;
    if(typeof origStart === 'function' && !origStart.__fateSmoothWarmWrapped){
      window.startGame = function(){
        const result = origStart.apply(this, arguments);
        setTimeout(warmGameAssets, 350);
        setTimeout(warmGameAssets, 1400);
        return result;
      };
      window.startGame.__fateSmoothWarmWrapped = true;
    }
  }

  function installObserver(){
    if(!window.MutationObserver || document.__fateSmoothObserver) return;
    // Only fire when the added nodes contain at least one IMG element. The previous
    // version fired on EVERY DOM mutation anywhere in the document — text changes
    // in the pending badge, presence renders, notifications, etc. — which on the
    // title screen meant ~44 times per second of useless work for a node tree
    // that has zero new images.
    function recordHasImage(record){
      if(!record.addedNodes || !record.addedNodes.length) return false;
      for(let i=0; i<record.addedNodes.length; i++){
        const n = record.addedNodes[i];
        if(!n || n.nodeType !== 1) continue;
        if(n.tagName === 'IMG') return true;
        if(n.querySelector && n.querySelector('img')) return true;
      }
      return false;
    }
    document.__fateSmoothObserver = new MutationObserver(function(records){
      let anyImage = false;
      const roots = new Set();
      for(let i=0; i<records.length; i++){
        const record = records[i];
        if(!recordHasImage(record)) continue;
        anyImage = true;
        if(record.target && isHighChurnGameRoot(record.target)) continue;
        if(record.target && record.target.nodeType === 1) {
          const root = getRelevantImageRoot(record.target);
          if(root) roots.add(root);
        }
        record.addedNodes.forEach(function(node){
          if(isHighChurnGameRoot(node)) return;
          const root = getRelevantImageRoot(node);
          if(root) roots.add(root);
        });
      }
      if(!anyImage) return;
      roots.forEach(function(root){
        if(isHighChurnGameRoot(root)) return;
        scheduleOptimizeImages(root);
      });
    });
    // Observe document for image optimization but disconnect during active game
    document.__fateSmoothObserver.observe(document.documentElement, {childList:true, subtree:true});
    // Auto-disconnect when entering game, reconnect when leaving
    window.addEventListener('fate-screen-changed', function(){
      if(document.getElementById('s-game')?.classList.contains('active')){
        try{ document.__fateSmoothObserver.disconnect(); }catch(e){}
      } else {
        try{ document.__fateSmoothObserver.observe(document.documentElement, {childList:true, subtree:true}); }catch(e){}
      }
    });
  }

  function installFrameDiagnostics(){
    if(window.__fateFrameDiagnosticsInstalled) return;
    window.__fateFrameDiagnosticsInstalled = true;
    const perf = window.__fatePerf = window.__fatePerf || { slowFrames:0, worstFrameMs:0, longTasks:0, renderSamples:[] };
    perf.fpsWatchdogEnabled = false;
    let last = performance.now();
    let slowBurst = 0;
    let lastRecoveryAt = 0;
    let recoveryCooldown = 8000;
    let lastRenderImageOptimizeAt = 0;
    let fpsWindowStart = last;
    let fpsWindowFrames = 0;
    let lowFpsWindows = 0;
    let observerResumeTimer = 0;
    let lastLongTaskCount = perf.longTasks || 0;
    let focusThrottleStartedAt = 0;
    let lastHardRecoveryAt = 0;
    let hardRecoveryActive = false;
    let diagnosticTickTimer = 0;
    let fpsWatchdogRunning = false;
    function scheduleDiagnosticTick(delayMs){
      const delay = Math.max(0, Number(delayMs || 0) || 0);
      if(delay > 0){
        if(diagnosticTickTimer) return;
        diagnosticTickTimer = setTimeout(function(){
          diagnosticTickTimer = 0;
          requestAnimationFrame(tick);
        }, delay);
        return;
      }
      requestAnimationFrame(tick);
    }
    function scheduleNextDiagnosticTick(){
      if(!fpsWatchdogRunning) return;
      const focusThrottled = document.hasFocus && !document.hasFocus();
      if(document.hidden || window.__fatePageHidden || focusThrottled) scheduleDiagnosticTick(250);
      else scheduleDiagnosticTick(0);
    }
    function startFpsWatchdog(){
      if(fpsWatchdogRunning) return;
      fpsWatchdogRunning = true;
      const p = window.__fatePerf = window.__fatePerf || {};
      p.fpsWatchdogEnabled = true;
      last = performance.now();
      fpsWindowStart = last;
      fpsWindowFrames = 0;
      scheduleNextDiagnosticTick();
    }
    window.fateEnableFpsWatchdog = function(){
      try{ localStorage.setItem('fateFpsWatchdogEnabled', '1'); }catch(e){}
      startFpsWatchdog();
      console.warn('[Fate FPS] 60Hz FPS watchdog enabled for this session.');
    };
    window.fateDisableFpsWatchdog = function(){
      try{ localStorage.removeItem('fateFpsWatchdogEnabled'); }catch(e){}
      fpsWatchdogRunning = false;
      if(diagnosticTickTimer) clearTimeout(diagnosticTickTimer);
      diagnosticTickTimer = 0;
      const p = window.__fatePerf = window.__fatePerf || {};
      p.fpsWatchdogEnabled = false;
      console.warn('[Fate FPS] 60Hz FPS watchdog disabled.');
    };
    function forceCompositorLayerRebuild(reason, done){
      if(hardRecoveryActive) return false;
      hardRecoveryActive = true;
      const html = document.documentElement;
      const body = document.body;
      const activeScreen = document.querySelector('.screen.active');
      const game = document.getElementById('s-game');
      const roots = [html, body, activeScreen, game].filter(Boolean);
      const prior = roots.map(function(el){
        return {
          el,
          transform: el.style.transform || '',
          contain: el.style.contain || '',
          willChange: el.style.willChange || ''
        };
      });
      if(html) html.classList.add('fate-compositor-reboot');
      if(body) body.classList.add('fate-compositor-reboot');
      roots.forEach(function(el){
        try{
          el.style.willChange = 'auto';
          el.style.contain = 'none';
          el.style.transform = 'translateZ(0)';
        }catch(e){}
      });
      requestAnimationFrame(function(){
        requestAnimationFrame(function(){
          prior.forEach(function(item){
            try{
              item.el.style.transform = item.transform;
              item.el.style.contain = item.contain;
              item.el.style.willChange = item.willChange;
            }catch(e){}
          });
          if(html) html.classList.remove('fate-compositor-reboot');
          if(body) body.classList.remove('fate-compositor-reboot');
          hardRecoveryActive = false;
          if(typeof done === 'function') done();
        });
      });
      return true;
    }
    function hardCompositorReset(now, reason, force){
      if(!force && now - lastHardRecoveryAt < 45000) return false;
      lastHardRecoveryAt = now;
      perf.hardRecoveries = (perf.hardRecoveries || 0) + 1;
      perf.lastHardRecoveryReason = reason || 'hard-compositor-reset';
      cleanupTransientVisuals();
      pendingImageRoots.clear();
      imageFlushScheduled = false;
      if(typeof window.invalidateFateRenderCaches === 'function') window.invalidateFateRenderCaches();
      const started = performance.now();
      const ran = forceCompositorLayerRebuild(reason, function(){
        perf.lastHardRecoveryMs = Math.round((performance.now() - started) * 10) / 10;
        if(typeof window.invalidateFateRenderCaches === 'function') window.invalidateFateRenderCaches();
        var game = document.getElementById('s-game');
        if(game && game.classList.contains('active')){
          requestAnimationFrame(function(){
            if(typeof window.renderGame === 'function') window.renderGame({hand:true,scores:true,piles:true,landscape:true,oppHand:true,topbar:true});
          });
        } else if(typeof window.safeRenderTitleProfile === 'function' && document.getElementById('s-title')?.classList.contains('active')){
          window.safeRenderTitleProfile();
        }
      });
      if(ran && typeof console !== 'undefined') console.log('[Fate FPS] Hard compositor reset: ' + reason + ' (hard recovery #' + perf.hardRecoveries + ')');
      return ran;
    }
    function softCompositorReset(now, reason, force){
      if(!force && now - lastRecoveryAt < recoveryCooldown) return;
      lastRecoveryAt = now;
      recoveryCooldown = Math.min(60000, recoveryCooldown * 2);
      perf.recoveries = (perf.recoveries || 0) + 1;
      perf.lastRecoveryReason = reason || 'slow-fps';
      cleanupTransientVisuals();
      pendingImageRoots.clear();
      imageFlushScheduled = false;
      if(typeof window.invalidateFateRenderCaches === 'function') window.invalidateFateRenderCaches();
      var game = document.getElementById('s-game');
      if(game && game.classList.contains('active')){
        requestAnimationFrame(function(){
          if(typeof window.renderGame === 'function') window.renderGame({hand:true,scores:true,piles:true,landscape:true,oppHand:true,topbar:true});
        });
      }
      if(typeof console !== 'undefined') console.log('[Fate FPS] Compositor reset: ' + reason + ' (recovery #' + perf.recoveries + ', next cooldown ' + Math.round(recoveryCooldown/1000) + 's)');
    }
    // Expose manual recovery for debugging: call window.fateResetFps() from console
    window.fateResetFps = function(){
      softCompositorReset(performance.now(), 'manual', true);
      if(typeof toast === 'function') toast('FPS recovery triggered');
    };
    window.fateSoftCompositorReset = function(reason, force){
      softCompositorReset(performance.now(), reason || 'manual-soft', !!force);
    };
    window.fateHardResetFps = function(reason){
      hardCompositorReset(performance.now(), reason || 'manual-hard', true);
      if(typeof toast === 'function') toast('Hard FPS recovery triggered');
    };
    function measureRafFps(durationMs){
      return new Promise(function(resolve){
        const started = performance.now();
        let frames = 0;
        let lastFrame = started;
        let maxGap = 0;
        const gaps = [];
        let active = true;
        function frame(now){
          if(!active) return;
          const gap = now - lastFrame;
          lastFrame = now;
          frames += 1;
          maxGap = Math.max(maxGap, gap);
          if(gap > 34) gaps.push(Math.round(gap * 10) / 10);
          requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
        setTimeout(function(){
          active = false;
          const elapsed = Math.max(1, performance.now() - started);
          resolve({
            elapsedMs: Math.round(elapsed),
            frames,
            fps: Math.round(frames * 1000 / elapsed),
            maxGapMs: Math.round(maxGap * 10) / 10,
            slowGaps: gaps.slice(-30)
          });
        }, Math.max(1000, Math.min(10000, Number(durationMs) || 4000)));
      });
    }
    function waitForPageFocus(timeoutMs){
      const started = performance.now();
      const hasPageFocus = function(){
        return !document.hidden && (!document.hasFocus || document.hasFocus());
      };
      if(hasPageFocus()) return Promise.resolve({waitedMs:0, focused:true});
      if(typeof toast === 'function') toast('Click the game page to start the FPS probe');
      return new Promise(function(resolve){
        let done = false;
        let raf = 0;
        let timer = 0;
        function finish(focused){
          if(done) return;
          done = true;
          clearTimeout(timer);
          if(raf) cancelAnimationFrame(raf);
          window.removeEventListener('focus', check, true);
          window.removeEventListener('pointerdown', check, true);
          window.removeEventListener('keydown', check, true);
          document.removeEventListener('visibilitychange', check, true);
          resolve({waitedMs:Math.round(performance.now() - started), focused:!!focused});
        }
        function check(){
          if(hasPageFocus()) finish(true);
        }
        function loop(){
          check();
          if(!done) raf = requestAnimationFrame(loop);
        }
        window.addEventListener('focus', check, true);
        window.addEventListener('pointerdown', check, true);
        window.addEventListener('keydown', check, true);
        document.addEventListener('visibilitychange', check, true);
        timer = setTimeout(function(){ finish(hasPageFocus()); }, Math.max(3000, Math.min(30000, Number(timeoutMs) || 15000)));
        raf = requestAnimationFrame(loop);
      });
    }
    window.fateRecoveryProbe = async function(){
      const focusBeforeProbe = await waitForPageFocus(15000);
      const beforeReport = window.fatePerfReport ? window.fatePerfReport() : null;
      const beforeMeasure = await measureRafFps(4000);
      hardCompositorReset(performance.now(), 'manual-probe', true);
      await new Promise(function(resolve){ setTimeout(resolve, 800); });
      const focusAfterRecovery = await waitForPageFocus(8000);
      const afterMeasure = await measureRafFps(4000);
      const afterReport = window.fatePerfReport ? window.fatePerfReport() : null;
      const result = {at:new Date().toISOString(), focusBeforeProbe, focusAfterRecovery, beforeReport, beforeMeasure, afterMeasure, afterReport};
      const text = JSON.stringify(result, null, 2);
      console.log('[Fate FPS] recovery probe - paste this back to Codex:', result);
      console.log(text);
      try{
        if(navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
      }catch(e){}
      return result;
    };
    window.fatePerfReport = function(){
      const snapshot = {
        activeScreen: getActiveScreenId(),
        fps: perf.lastFpsEstimate || 0,
        worstFrameMs: Math.round((perf.worstFrameMs || 0) * 10) / 10,
        slowFrames: perf.slowFrames || 0,
        longTasks: perf.longTasks || 0,
        hidden: document.hidden,
        hasFocus: document.hasFocus ? document.hasFocus() : null,
        focusThrottled: !!perf.focusThrottled,
        focusThrottleMs: perf.focusThrottleMs || 0,
        fpsStatus: perf.fpsStatus || 'active',
        lifecycleEvents: (perf.lifecycleEvents || lifecycleEvents || []).slice(-20),
        browserRenderThrottleLastProbe: perf.browserRenderThrottleLastProbe || null,
        browserRenderThrottleLast: perf.browserRenderThrottleLast || null,
        fpsWatchdogEnabled: !!perf.fpsWatchdogEnabled,
        rafMonitorEnabled: !!perf.rafMonitorEnabled,
        promiseMonitorEnabled: !!perf.promiseMonitorEnabled,
        rafCallsPerSecond: perf.rafCallsPerSecond || 0,
        rafCallsPeak: perf.rafCallsPeak || 0,
        promiseThenRate: perf.promiseThenRate || 0,
        promiseThenPeak: perf.promiseThenPeak || 0,
        promiseFloods: perf.promiseFloods || 0,
        recoveries: perf.recoveries || 0,
        lastRecoveryReason: perf.lastRecoveryReason || '',
        nativeTimerDelayMs: perf.nativeTimerDelayMs || 0,
        timerBridgeActiveTasks: perf.timerBridgeActiveTasks || 0,
        timerBridgeMaxDriftMs: perf.timerBridgeMaxDriftMs || 0,
        hardRecoveries: perf.hardRecoveries || 0,
        lastHardRecoveryReason: perf.lastHardRecoveryReason || '',
        lastHardRecoveryMs: perf.lastHardRecoveryMs || 0,
        suppressedOffscreenGameRenders: perf.suppressedOffscreenGameRenders || 0,
        lastSuppressedGameRender: perf.lastSuppressedGameRender || null,
        renderRequests: perf.renderRequests || 0,
        broadRenderRequests: perf.broadRenderRequests || 0,
        scopedRenderRequests: perf.scopedRenderRequests || 0,
        lastRenderRequestParts: perf.lastRenderRequestParts || '',
        lastBroadRenderParts: perf.lastBroadRenderParts || '',
        lastScopedRenderParts: perf.lastScopedRenderParts || '',
        canvasBoard: typeof window.fateCanvasBoardReport === 'function' ? window.fateCanvasBoardReport() : null,
        renderV2Flags: window.FateRenderV2Flags && typeof window.FateRenderV2Flags.report === 'function' ? window.FateRenderV2Flags.report() : null,
        renderSnapshot: typeof window.fateRenderSnapshotReport === 'function' ? window.fateRenderSnapshotReport() : null,
        matchLayout: typeof window.fateMatchLayoutReport === 'function' ? window.fateMatchLayoutReport() : null,
        recentRenderSamples: (perf.renderSamples || []).slice(-10),
        recentRenderBreakdowns: (perf.renderBreakdowns || []).slice(-10),
        fpsHistory: (perf.fpsHistory || []).slice(-30)
      };
      if(console && console.table && snapshot.fpsHistory.length) console.table(snapshot.fpsHistory.slice(-12));
      console.log('[Fate FPS] report', snapshot);
      return snapshot;
    };

    function safeDiagCall(name){
      try{
        const fn = window[name];
        return typeof fn === 'function' ? fn() : null;
      }catch(e){
        return {error:String(e && e.message || e)};
      }
    }

    let lastElectronPerformanceInfo = null;
    async function readElectronPerformanceInfo(){
      try{
        const api = window.FateElectronPerformance;
        if(!api || typeof api.getInfo !== 'function') return null;
        const info = await api.getInfo();
        lastElectronPerformanceInfo = info || null;
        return lastElectronPerformanceInfo;
      }catch(e){
        lastElectronPerformanceInfo = {error:String(e && e.message || e)};
        return lastElectronPerformanceInfo;
      }
    }
    function refreshElectronPerformanceInfo(){
      try{
        const api = window.FateElectronPerformance;
        if(!api || typeof api.getInfo !== 'function') return;
        api.getInfo().then(function(info){
          lastElectronPerformanceInfo = info || null;
        }, function(err){
          lastElectronPerformanceInfo = {error:String(err && err.message || err)};
        });
      }catch(e){}
    }

    function readDiagLocalStorage(){
      const keys = [
        'fateDisableMatchRendererV2',
        'fateEnableMatchRendererV2',
        'fateLowEffects',
        'fateDisableWarmups',
        'fateDisableTitleWarmup',
        'fateDisableTextureWarmup'
      ];
      const out = {};
      keys.forEach(function(key){
        try{ out[key] = localStorage.getItem(key); }
        catch(e){ out[key] = 'unavailable'; }
      });
      return out;
    }

    function summarizeNavigationTiming(){
      try{
        const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
        if(!nav) return null;
        const base = nav.startTime || 0;
        function ms(value){ return Math.round(Math.max(0, (Number(value) || 0) - base)); }
        return {
          type:nav.type || '',
          redirectMs:ms(nav.redirectEnd) - ms(nav.redirectStart),
          dnsMs:ms(nav.domainLookupEnd) - ms(nav.domainLookupStart),
          connectMs:ms(nav.connectEnd) - ms(nav.connectStart),
          requestToResponseMs:ms(nav.responseEnd) - ms(nav.requestStart),
          domInteractiveMs:ms(nav.domInteractive),
          domContentLoadedMs:ms(nav.domContentLoadedEventEnd),
          loadEventMs:ms(nav.loadEventEnd),
          transferSize:nav.transferSize || 0,
          encodedBodySize:nav.encodedBodySize || 0
        };
      }catch(e){
        return {error:String(e && e.message || e)};
      }
    }

    function summarizeResources(){
      try{
        const entries = performance.getEntriesByType ? performance.getEntriesByType('resource') : [];
        const byType = {};
        const slow = [];
        const firebase = [];
        entries.forEach(function(entry){
          const type = entry.initiatorType || 'other';
          const bucket = byType[type] || (byType[type] = {count:0, totalMs:0, transferKB:0, encodedKB:0});
          bucket.count += 1;
          bucket.totalMs += Number(entry.duration) || 0;
          bucket.transferKB += (Number(entry.transferSize) || 0) / 1024;
          bucket.encodedKB += (Number(entry.encodedBodySize) || 0) / 1024;
          const name = String(entry.name || '');
          const row = {
            type,
            ms:Math.round(Number(entry.duration) || 0),
            transferKB:Math.round(((Number(entry.transferSize) || 0) / 1024) * 10) / 10,
            encodedKB:Math.round(((Number(entry.encodedBodySize) || 0) / 1024) * 10) / 10,
            name:name.replace(/^https?:\/\/([^/]+)\/?/, '$1/')
          };
          slow.push(row);
          if(/firebase|gstatic|googleapis|identitytoolkit/i.test(name)) firebase.push(row);
        });
        Object.keys(byType).forEach(function(type){
          const bucket = byType[type];
          bucket.totalMs = Math.round(bucket.totalMs);
          bucket.transferKB = Math.round(bucket.transferKB * 10) / 10;
          bucket.encodedKB = Math.round(bucket.encodedKB * 10) / 10;
        });
        slow.sort(function(a, b){ return b.ms - a.ms; });
        firebase.sort(function(a, b){ return b.ms - a.ms; });
        return {
          count:entries.length,
          byType,
          slowest:slow.slice(0, 14),
          firebase:firebase.slice(0, 10)
        };
      }catch(e){
        return {error:String(e && e.message || e)};
      }
    }

    function summarizeDiagMemory(){
      try{
        if(!performance.memory) return null;
        return {
          usedMB:Math.round(performance.memory.usedJSHeapSize / 104857.6) / 10,
          totalMB:Math.round(performance.memory.totalJSHeapSize / 104857.6) / 10,
          limitMB:Math.round(performance.memory.jsHeapSizeLimit / 104857.6) / 10
        };
      }catch(e){
        return null;
      }
    }

    function buildStartupDiagNotes(snapshot){
      const notes = [];
      const renderer = snapshot.reports && snapshot.reports.matchRendererV2;
      const flags = snapshot.reports && snapshot.reports.renderV2Flags;
      const canvas = renderer && renderer.canvas;
      const resources = snapshot.resources || {};
      const storage = snapshot.localStorage || {};
      if(storage.fateDisableMatchRendererV2 === '1' || /[?&](domBoard|matchRendererV2=0)(?:&|$)/.test(snapshot.locationSearch || '')) {
        notes.push('V2 canvas renderer is disabled, so browser matches may be using the slower DOM board path.');
      } else if(flags && flags.enabled === false) {
        notes.push('Render V2 flags report disabled; verify URL/localStorage render flags before comparing browser and Electron.');
      }
      if(canvas && Number(canvas.dpr || 1) > Number(canvas.effectiveDpr || canvas.dpr || 1) + .05) {
        notes.push('Browser/device DPR is being capped for match canvas work; this avoids high-DPI overdraw during matches.');
      } else if(snapshot.viewport && snapshot.viewport.dpr > 1.25 && (!canvas || Number(canvas.effectiveDpr || 1) > 1.5)) {
        notes.push('High devicePixelRatio can make the browser draw far more canvas pixels than Electron for the same board.');
      }
      if(canvas && Number(canvas.totalLayerPixelArea || 0) > 18000000) {
        notes.push('Canvas layer pixel area is high; match frame cost is likely fill-rate bound, especially during set/consolidation redraws.');
      }
      if(renderer && Number(renderer.avgMs || 0) > 12) {
        notes.push('Renderer average frame cost is near the 60fps budget; check recentRenderBreakdowns after a slow set/consolidation.');
      }
      if(snapshot.perf && Number(snapshot.perf.longTasks || 0) > 0) {
        notes.push('Long tasks were observed on the main thread; startup lag may include JS execution rather than only rendering.');
      }
      if(snapshot.hasFocus === false) {
        notes.push('The app window was not focused when this was captured; run again with the game focused before trusting wake/throttle comparisons.');
      }
      const electron = snapshot.electronPerformance || null;
      if(snapshot.isElectron && !electron) {
        notes.push('Electron performance IPC was not available in this capture; preload may be stale until the app is relaunched.');
      }
      if(electron && electron.webContentsInfo && electron.webContentsInfo.isDevToolsOpened) {
        notes.push('Electron DevTools was open during this capture; compare again with DevTools closed before judging menu cost.');
      }
      if(electron && electron.webContentsInfo && electron.webContentsInfo.isFocused === false) {
        notes.push('Electron webContents was not focused during this capture; first-click wake/focus cost may be mixed into the lag sample.');
      }
      if(electron && electron.windowInfo && electron.windowInfo.isFocused === false) {
        notes.push('Electron window focus was false during this capture; repeat focused if the slow sample was a first interaction.');
      }
      if(snapshot.onlineModules && snapshot.onlineModules.deferred && !snapshot.onlineModules.loaded && !snapshot.onlineModules.loading) {
        notes.push('Online/Firebase modules are currently deferred, so title startup should not be blocked by remote auth/social loading.');
      }
      if(snapshot.onlineModules && snapshot.onlineModules.loading) {
        notes.push('Online/Firebase modules are loading during this capture; startup clicks may hitch until that import chain finishes.');
      }
      if(resources.firebase && resources.firebase.length) {
        const slowFirebase = resources.firebase.filter(function(row){ return row.ms > 250; }).length;
        if(slowFirebase) notes.push('Firebase/Gstatic resources were slow during startup; Electron first-open lag may be remote auth/social module loading.');
      }
      if(snapshot.fpsProbe && snapshot.fpsProbe.fps && snapshot.fpsProbe.fps < 55) {
        notes.push('Short RAF probe measured below 55fps; run this command immediately after the laggy action for a cleaner capture.');
      }
      if(!notes.length) notes.push('No obvious single culprit in this snapshot; run during the first laggy click or right after setting/consolidating.');
      return notes;
    }

    window.fateStartupDiag = async function(options){
      const opts = options || {};
      const snapshot = {
        at:new Date().toISOString(),
        command:'await fateStartupDiag({ fpsProbe: true })',
        activeScreen:getActiveScreenId(),
        isElectron:isElectronShell(),
        userAgent:navigator.userAgent || '',
        locationSearch:window.location.search || '',
        readyState:document.readyState,
        hidden:!!document.hidden,
        hasFocus:document.hasFocus ? !!document.hasFocus() : null,
        viewport:{w:window.innerWidth || 0, h:window.innerHeight || 0, dpr:window.devicePixelRatio || 1},
        localStorage:readDiagLocalStorage(),
        navigation:summarizeNavigationTiming(),
        resources:summarizeResources(),
        memory:summarizeDiagMemory(),
        electronPerformance:await readElectronPerformanceInfo(),
        onlineModules:window.__fateOnlineModuleState ? Object.assign({}, window.__fateOnlineModuleState) : null,
        perf:window.fatePerfReport ? window.fatePerfReport() : null,
        reports:{
          renderV2Flags:window.FateRenderV2Flags && typeof window.FateRenderV2Flags.report === 'function' ? window.FateRenderV2Flags.report() : null,
          matchRendererV2:safeDiagCall('fateMatchRendererV2Report'),
          canvasBoard:safeDiagCall('fateCanvasBoardReport'),
          textureCache:safeDiagCall('fateCardTextureCacheReport'),
          vfx:safeDiagCall('fateVfxReport'),
          vfxRecipes:safeDiagCall('fateVfxRecipesReport'),
          motionFx:safeDiagCall('fateV2MotionFxReport'),
          onlineState:safeDiagCall('fateOnlineStateReport'),
          timerBridge:safeDiagCall('fateTimerBridgeReport'),
          audio:safeDiagCall('fateAudioReport'),
          handDrag:safeDiagCall('fateMatchHandDragReport')
        },
        fpsProbe:null
      };
      if(opts.fpsProbe) snapshot.fpsProbe = await measureRafFps(opts.durationMs || 1600);
      snapshot.notes = buildStartupDiagNotes(snapshot);
      console.log('[Fate Startup Diag]', snapshot);
      try{
        if(opts.copy !== false && navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
          console.log('[Fate Startup Diag] copied JSON to clipboard');
        }
      }catch(e){}
      return snapshot;
    };
    window.fateDiagnoseStartup = window.fateStartupDiag;

    function getLagTraceSnapshot(){
      const active = getActiveScreenId();
      const game = document.getElementById('s-game');
      const heap = performance && performance.memory ? {
        usedMB: Math.round(performance.memory.usedJSHeapSize / 104857.6) / 10,
        totalMB: Math.round(performance.memory.totalJSHeapSize / 104857.6) / 10,
        limitMB: Math.round(performance.memory.jsHeapSizeLimit / 104857.6) / 10
      } : null;
      let animationCount = 0;
      try { animationCount = document.getAnimations ? document.getAnimations().filter(a=>a.playState === 'running').length : 0; } catch(e) {}
      const selectorCounts = {};
      [
        '.zone','.cell','.bc','.hc','.mc','.visual-mc',
        '.placement-anim-ghost','.consolidation-cinematic-overlay','.cc-overlay-v2',
        '.zone-floating-banner','.last-turn-banner','.booster-drop-banner',
        '.modal','.overlay','.world-chat-widget','.ingame-chat-widget',
        'img','button'
      ].forEach(sel=>{
        try { selectorCounts[sel] = document.querySelectorAll(sel).length; } catch(e) {}
      });
      const renderSamples = (perf.renderSamples || []).slice(-40);
      const renderBreakdowns = (perf.renderBreakdowns || []).slice(-20);
      const renderCallers = Object.entries(perf.renderCallerStats || {})
        .map(([caller, item]) => ({
          caller,
          count: Number(item.count || 0),
          broad: Number(item.broad || 0),
          scoped: Number(item.scoped || 0),
          lastAt: item.lastAt || 0,
          parts: item.parts || ''
        }))
        .sort((a,b)=>b.count-a.count || b.lastAt-a.lastAt)
        .slice(0, 12);
      const renderSummary = {};
      renderSamples.forEach(s=>{
        if(!renderSummary[s.name]) renderSummary[s.name] = {count:0,totalMs:0,maxMs:0};
        renderSummary[s.name].count += 1;
        renderSummary[s.name].totalMs += Number(s.ms) || 0;
        renderSummary[s.name].maxMs = Math.max(renderSummary[s.name].maxMs, Number(s.ms) || 0);
      });
      Object.keys(renderSummary).forEach(name=>{
        const item = renderSummary[name];
        item.avgMs = Math.round((item.totalMs / Math.max(1, item.count)) * 10) / 10;
        item.maxMs = Math.round(item.maxMs * 10) / 10;
        delete item.totalMs;
      });
      return {
        at: new Date().toISOString(),
        activeScreen: active,
        hidden: document.hidden || !!window.__fatePageHidden,
        htmlClasses: document.documentElement ? document.documentElement.className : '',
        bodyClasses: document.body ? document.body.className : '',
        viewport: {w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1},
        gameRect: game ? (function(r){ return {w:Math.round(r.width), h:Math.round(r.height), x:Math.round(r.x), y:Math.round(r.y)}; })(game.getBoundingClientRect()) : null,
        gameState: (typeof G !== 'undefined' && G) ? {
          phase: G.phase,
          turn: G.turn,
          currentPlayer: G.currentPlayer,
          aiPlayer: G.aiPlayer,
          isOnline: !!G._onlineRoomCode,
          isSpectator: !!G._isSpectator,
          boardCards: G.board ? G.board.reduce((n,z)=>n + z.reduce((m,r)=>m + r.filter(Boolean).length,0),0) : 0,
          p1Hand: G.players?.[0]?.hand?.length || 0,
          p2Hand: G.players?.[1]?.hand?.length || 0,
          p1Deck: G.players?.[0]?.deck?.length || 0,
          p2Deck: G.players?.[1]?.deck?.length || 0
        } : null,
        perf: {
          fps: perf.lastFpsEstimate || 0,
          fpsWatchdogEnabled: !!perf.fpsWatchdogEnabled,
          rafMonitorEnabled: !!perf.rafMonitorEnabled,
          promiseMonitorEnabled: !!perf.promiseMonitorEnabled,
          worstFrameMs: Math.round((perf.worstFrameMs || 0) * 10) / 10,
          slowFrames: perf.slowFrames || 0,
          longTasks: perf.longTasks || 0,
          rafCallsPerSecond: perf.rafCallsPerSecond || 0,
          rafCallsPeak: perf.rafCallsPeak || 0,
          promiseThenRate: perf.promiseThenRate || 0,
          promiseThenPeak: perf.promiseThenPeak || 0,
          promiseFloods: perf.promiseFloods || 0,
          recoveries: perf.recoveries || 0,
          lastRecoveryReason: perf.lastRecoveryReason || '',
          nativeTimerDelayMs: perf.nativeTimerDelayMs || 0,
          timerBridgeActiveTasks: perf.timerBridgeActiveTasks || 0,
          timerBridgeMaxDriftMs: perf.timerBridgeMaxDriftMs || 0,
          hardRecoveries: perf.hardRecoveries || 0,
          lastHardRecoveryReason: perf.lastHardRecoveryReason || '',
          lastHardRecoveryMs: perf.lastHardRecoveryMs || 0,
          suppressedOffscreenGameRenders: perf.suppressedOffscreenGameRenders || 0,
          lastSuppressedGameRender: perf.lastSuppressedGameRender || null,
          renderRequests: perf.renderRequests || 0,
          broadRenderRequests: perf.broadRenderRequests || 0,
          scopedRenderRequests: perf.scopedRenderRequests || 0,
          lastRenderRequestParts: perf.lastRenderRequestParts || '',
          lastBroadRenderParts: perf.lastBroadRenderParts || '',
          lastScopedRenderParts: perf.lastScopedRenderParts || ''
        },
        canvasBoard: typeof window.fateCanvasBoardReport === 'function' ? window.fateCanvasBoardReport() : null,
        renderV2Flags: window.FateRenderV2Flags && typeof window.FateRenderV2Flags.report === 'function' ? window.FateRenderV2Flags.report() : null,
        renderSnapshot: typeof window.fateRenderSnapshotReport === 'function' ? window.fateRenderSnapshotReport() : null,
        matchLayout: typeof window.fateMatchLayoutReport === 'function' ? window.fateMatchLayoutReport() : null,
        selectorCounts,
        animationCount,
        heap,
        electronPerformance:lastElectronPerformanceInfo,
        renderSummary,
        recentRenderSamples: renderSamples.slice(-12),
        recentRenderBreakdowns: renderBreakdowns.slice(-8),
        renderCallers,
        menuSummary:summarizeMenuSamples(),
        recentMenuSamples:(perf.menuSamples || []).slice(-30),
        recentLongTasks: (perf.longTaskSamples || []).slice(-12),
        lifecycleEvents: (perf.lifecycleEvents || lifecycleEvents || []).slice(-20),
        browserRenderThrottleLastProbe: perf.browserRenderThrottleLastProbe || null,
        browserRenderThrottleLast: perf.browserRenderThrottleLast || null,
        fpsHistory: (perf.fpsHistory || []).slice(-20)
      };
    }
    function summarizeMenuSamples(){
      const samples = (perf.menuSamples || []).slice(-80);
      const out = {};
      samples.forEach(function(sample){
        const key = sample.name || sample.kind || 'unknown';
        const item = out[key] || (out[key] = {count:0, totalMs:0, maxMs:0, lastMs:0, lastScreen:'', lastLabel:''});
        const ms = Number(sample.ms) || 0;
        item.count += 1;
        item.totalMs += ms;
        item.maxMs = Math.max(item.maxMs, ms);
        item.lastMs = Math.round(ms * 10) / 10;
        item.lastScreen = sample.screen || '';
        item.lastLabel = sample.label || sample.args || '';
      });
      Object.keys(out).forEach(function(key){
        const item = out[key];
        item.avgMs = Math.round((item.totalMs / Math.max(1, item.count)) * 10) / 10;
        item.maxMs = Math.round(item.maxMs * 10) / 10;
        delete item.totalMs;
      });
      return out;
    }
    window.fateTraceLag = function(seconds){
      const durationMs = Math.max(2000, Math.min(20000, Math.round((Number(seconds) || 8) * 1000)));
      refreshElectronPerformanceInfo();
      const started = performance.now();
      const trace = {
        command: 'fateTraceLag',
        requestedSeconds: Math.round(durationMs / 100) / 10,
        before: getLagTraceSnapshot(),
        samples: [],
        frameGaps: []
      };
      let frameCount = 0;
      let maxFrameGap = 0;
      let lastFrame = performance.now();
      let active = true;
      function traceFrame(now){
        if(!active) return;
        const gap = now - lastFrame;
        lastFrame = now;
        frameCount += 1;
        if(gap > maxFrameGap) maxFrameGap = gap;
        if(gap > 34) trace.frameGaps.push(Math.round(gap * 10) / 10);
        if(trace.frameGaps.length > 80) trace.frameGaps.shift();
        requestAnimationFrame(traceFrame);
      }
      requestAnimationFrame(traceFrame);
      const sampleTimer = setInterval(function(){
        refreshElectronPerformanceInfo();
        trace.samples.push(getLagTraceSnapshot());
        if(trace.samples.length > 50) trace.samples.shift();
      }, 500);
      if(typeof toast === 'function') toast('Lag trace started. Keep playing until it finishes.');
      return new Promise(function(resolve){
        setTimeout(function(){
          active = false;
          clearInterval(sampleTimer);
          const elapsed = Math.max(1, performance.now() - started);
          trace.after = getLagTraceSnapshot();
          trace.measured = {
            elapsedMs: Math.round(elapsed),
            fps: Math.round(frameCount * 1000 / elapsed),
            frames: frameCount,
            maxFrameGapMs: Math.round(maxFrameGap * 10) / 10,
            slowFrameGaps: trace.frameGaps.slice(-40)
          };
          trace.menuSummary = summarizeMenuSamples();
          trace.menuSamples = (perf.menuSamples || []).slice(-40);
          trace.compact = summarizeLagTrace(trace);
          trace.textSummary = formatLagTraceSummary(trace.compact);
          const text = JSON.stringify(trace, null, 2);
          console.log('[Fate FPS] lag trace summary:', trace.compact);
          if(console && console.table) {
            console.table(trace.compact.topMenuSummary || []);
            console.table(trace.compact.slowestMenuSamples || []);
            console.table(trace.compact.recentLongTasks || []);
          }
          console.log('[Fate FPS] lag trace text summary:\n' + trace.textSummary);
          console.log('[Fate FPS] lag trace - paste this back to Codex:', trace);
          console.log(text);
          try {
            if(navigator.clipboard && navigator.clipboard.writeText){
              navigator.clipboard.writeText(text).then(function(){
                if(typeof toast === 'function') toast('Lag trace copied. Paste it to Codex.');
              }).catch(function(){
                if(typeof toast === 'function') toast('Lag trace printed in console.');
              });
            } else if(typeof toast === 'function') toast('Lag trace printed in console.');
          } catch(e) {
            if(typeof toast === 'function') toast('Lag trace printed in console.');
          }
          resolve(trace);
        }, durationMs);
      });
    };
    function summarizeLagTrace(trace){
      const menuSummary = trace && trace.menuSummary || {};
      const menuRows = Object.keys(menuSummary).map(function(key){
        const item = menuSummary[key] || {};
        return {
          name:key,
          count:item.count || 0,
          avgMs:item.avgMs || 0,
          maxMs:item.maxMs || 0,
          lastMs:item.lastMs || 0,
          lastScreen:item.lastScreen || '',
          lastLabel:item.lastLabel || ''
        };
      }).sort(function(a, b){ return (b.maxMs || 0) - (a.maxMs || 0); }).slice(0, 10);
      const samples = (trace && trace.menuSamples || []).slice().sort(function(a, b){
        return (Number(b.ms) || 0) - (Number(a.ms) || 0);
      }).slice(0, 12).map(function(sample){
        return {
          kind:sample.kind || '',
          name:sample.name || '',
          ms:sample.ms || 0,
          screen:sample.screen || '',
          nextScreen:sample.nextScreen || '',
          label:sample.label || sample.args || ''
        };
      });
      const after = trace && trace.after || {};
      return {
        measured:trace && trace.measured || null,
        activeScreen:after.activeScreen || (trace && trace.before && trace.before.activeScreen) || '',
        maxFrameGapMs:trace && trace.measured && trace.measured.maxFrameGapMs || 0,
        slowFrameGaps:trace && trace.measured && trace.measured.slowFrameGaps || [],
        topMenuSummary:menuRows,
        slowestMenuSamples:samples,
        recentLongTasks:after.recentLongTasks || [],
        renderSummary:after.renderSummary || {},
        recentRenderBreakdowns:after.recentRenderBreakdowns || [],
        selectorCounts:after.selectorCounts || null,
        onlineModules:window.__fateOnlineModuleState ? Object.assign({}, window.__fateOnlineModuleState) : null
      };
    }
    function formatLagTraceSummary(summary){
      const s = summary || {};
      const lines = [];
      lines.push('activeScreen=' + (s.activeScreen || ''));
      if(s.measured) {
        lines.push('measured fps=' + (s.measured.fps || 0) + ' maxFrameGapMs=' + (s.measured.maxFrameGapMs || 0) + ' frames=' + (s.measured.frames || 0));
      } else {
        lines.push('measured=no active timed trace');
      }
      const online = s.onlineModules || {};
      lines.push('onlineModules loaded=' + !!online.loaded + ' loading=' + !!online.loading + ' deferred=' + !!online.deferred + ' reason=' + (online.reason || ''));
      lines.push('topMenuSummary:');
      (s.topMenuSummary || []).slice(0, 8).forEach(function(row, index){
        lines.push((index + 1) + '. ' + row.name + ' count=' + row.count + ' avgMs=' + row.avgMs + ' maxMs=' + row.maxMs + ' lastMs=' + row.lastMs + ' screen=' + row.lastScreen + ' label=' + row.lastLabel);
      });
      lines.push('slowestMenuSamples:');
      (s.slowestMenuSamples || []).slice(0, 10).forEach(function(row, index){
        lines.push((index + 1) + '. ' + row.kind + '/' + row.name + ' ms=' + row.ms + ' screen=' + row.screen + ' next=' + row.nextScreen + ' label=' + row.label);
      });
      lines.push('recentLongTasks:');
      (s.recentLongTasks || []).slice(-8).forEach(function(row, index){
        lines.push((index + 1) + '. duration=' + row.duration + ' start=' + row.start + ' name=' + row.name);
      });
      const selectors = s.selectorCounts || {};
      lines.push('selectors modal=' + (selectors['.modal'] || 0) + ' overlay=' + (selectors['.overlay'] || 0) + ' mc=' + (selectors['.mc'] || 0) + ' img=' + (selectors.img || 0) + ' button=' + (selectors.button || 0));
      return lines.join('\n');
    }
    window.fateTraceMenus = function(seconds){
      const duration = Math.max(3, Math.min(20, Number(seconds) || 10));
      if(typeof toast === 'function') toast('Menu trace started. Click the laggy menus now.');
      return window.fateTraceLag(duration);
    };
    window.fateTraceSummary = function(){
      const fakeTrace = {
        measured:null,
        after:getLagTraceSnapshot(),
        menuSummary:summarizeMenuSamples(),
        menuSamples:(perf.menuSamples || []).slice(-40)
      };
      const summary = summarizeLagTrace(fakeTrace);
      console.log('[Fate FPS] current trace summary:', summary);
      if(console && console.table) {
        console.table(summary.topMenuSummary || []);
        console.table(summary.slowestMenuSamples || []);
        console.table(summary.recentLongTasks || []);
      }
      const text = formatLagTraceSummary(summary);
      console.log('[Fate FPS] current trace text summary:\n' + text);
      try{
        if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
      }catch(e){}
      return summary;
    };
    window.fateTraceSummaryText = function(){
      const summary = window.fateTraceSummary();
      return formatLagTraceSummary(summary);
    };
    let activeMenuMinuteLog = null;
    function getElectronDiagnosticsApi(){
      try{
        const api = window.FateElectronDiagnostics;
        return api && typeof api.startUiMinuteLog === 'function' && typeof api.appendUiMinuteLog === 'function' ? api : null;
      }catch(e){
        return null;
      }
    }
    function gameScreenActive(){
      try{
        const el = document.getElementById('s-game');
        return !!(el && el.classList.contains('active'));
      }catch(e){
        return false;
      }
    }
    function makeMenuMinuteSessionId(){
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      let mode = getActiveScreenId() || 'menu';
      try{
        if(typeof CURRENT_MODE !== 'undefined' && CURRENT_MODE) mode = String(CURRENT_MODE).slice(0, 18);
      }catch(e){}
      return stamp + '-' + mode;
    }
    function compactMenuMinuteSnapshot(snapshot){
      if(!snapshot) return null;
      return {
        at:snapshot.at,
        activeScreen:snapshot.activeScreen,
        hidden:snapshot.hidden,
        htmlClasses:snapshot.htmlClasses,
        bodyClasses:snapshot.bodyClasses,
        viewport:snapshot.viewport,
        perf:snapshot.perf,
        selectorCounts:snapshot.selectorCounts,
        animationCount:snapshot.animationCount,
        heap:snapshot.heap,
        electronPerformance:snapshot.electronPerformance,
        renderSummary:snapshot.renderSummary,
        recentRenderBreakdowns:snapshot.recentRenderBreakdowns,
        renderCallers:snapshot.renderCallers,
        menuSummary:snapshot.menuSummary,
        recentLongTasks:snapshot.recentLongTasks,
        lifecycleEvents:snapshot.lifecycleEvents,
        fpsHistory:snapshot.fpsHistory,
        renderV2Flags:snapshot.renderV2Flags,
        renderSnapshot:snapshot.renderSnapshot,
        matchLayout:snapshot.matchLayout
      };
    }
    function stopMenuMinuteLog(reason){
      const state = activeMenuMinuteLog;
      if(!state || state.stopped) return state || null;
      state.stopped = true;
      activeMenuMinuteLog = null;
      try{ clearInterval(state.timer); }catch(e){}
      try{ if(state.frameRaf) cancelAnimationFrame(state.frameRaf); }catch(e){}
      const api = getElectronDiagnosticsApi();
      const payload = {
        type:'session-finish',
        at:new Date().toISOString(),
        sessionId:state.sessionId,
        reason:reason || 'complete',
        elapsedMs:Math.round(performance.now() - state.startedAt),
        samples:state.sampleCount || 0,
        finalScreen:getActiveScreenId()
      };
      if(api && typeof api.finishUiMinuteLog === 'function') api.finishUiMinuteLog(payload).catch(function(){});
      return Object.assign({ok:true}, payload, {paths:state.paths || null});
    }
    function startMenuMinuteLog(reason, options){
      const api = getElectronDiagnosticsApi();
      if(!api) return {ok:false, reason:'electron-diagnostics-unavailable'};
      if(activeMenuMinuteLog && !activeMenuMinuteLog.stopped) return {ok:true, alreadyRunning:true, sessionId:activeMenuMinuteLog.sessionId, paths:activeMenuMinuteLog.paths || null};
      if(gameScreenActive()) return {ok:false, reason:'game-screen-active'};
      const opts = options || {};
      const durationMs = Math.max(5000, Math.min(120000, Number(opts.durationMs) || 60000));
      const intervalMs = Math.max(500, Math.min(5000, Number(opts.intervalMs) || 1000));
      const state = {
        sessionId:makeMenuMinuteSessionId(),
        startedAt:performance.now(),
        startedIso:new Date().toISOString(),
        sampleCount:0,
        stopped:false,
        paths:null,
        lastFrameAt:performance.now(),
        intervalFrames:0,
        intervalMaxGap:0,
        intervalSlowGaps:[],
        sampleBusy:false,
        timer:0,
        frameRaf:0
      };
      activeMenuMinuteLog = state;
      function frame(now){
        if(state.stopped) return;
        const gap = now - state.lastFrameAt;
        state.lastFrameAt = now;
        state.intervalFrames += 1;
        if(gap > state.intervalMaxGap) state.intervalMaxGap = gap;
        if(gap > 34) {
          state.intervalSlowGaps.push(Math.round(gap * 10) / 10);
          if(state.intervalSlowGaps.length > 20) state.intervalSlowGaps.shift();
        }
        state.frameRaf = requestAnimationFrame(frame);
      }
      state.frameRaf = requestAnimationFrame(frame);
      function readFrameInterval(){
        const elapsed = Math.max(1, performance.now() - (state.lastSampleAt || state.startedAt));
        const item = {
          frames:state.intervalFrames,
          fps:Math.round(state.intervalFrames * 1000 / elapsed),
          maxFrameGapMs:Math.round(state.intervalMaxGap * 10) / 10,
          slowFrameGaps:state.intervalSlowGaps.slice(-20)
        };
        state.intervalFrames = 0;
        state.intervalMaxGap = 0;
        state.intervalSlowGaps = [];
        state.lastSampleAt = performance.now();
        return item;
      }
      async function writeSample(kind){
        if(state.stopped || state.sampleBusy) return;
        state.sampleBusy = true;
        try{
          await readElectronPerformanceInfo();
          const elapsedMs = Math.round(performance.now() - state.startedAt);
          const payload = {
            type:kind || 'sample',
            at:new Date().toISOString(),
            sessionId:state.sessionId,
            sampleIndex:state.sampleCount,
            elapsedMs,
            frameInterval:readFrameInterval(),
            snapshot:compactMenuMinuteSnapshot(getLagTraceSnapshot())
          };
          state.sampleCount += 1;
          await api.appendUiMinuteLog(payload);
          if(gameScreenActive()) stopMenuMinuteLog('entered-game-screen');
          else if(elapsedMs >= durationMs) stopMenuMinuteLog('duration-complete');
        }catch(e){
          state.lastError = String(e && e.message || e);
        }finally{
          state.sampleBusy = false;
        }
      }
      const meta = {
        sessionId:state.sessionId,
        reason:reason || 'main-menu-diagnostics',
        startedAt:state.startedIso,
        durationMs,
        intervalMs,
        location:String(location.href || ''),
        userAgent:navigator.userAgent || '',
        screen:getActiveScreenId(),
        isElectron:isElectronShell()
      };
      api.startUiMinuteLog(meta).then(function(res){
        state.paths = res && res.paths || null;
        window.__fateLatestMenuMinuteLogPath = state.paths && state.paths.latest || null;
        writeSample('initial-sample');
      }, function(err){
        state.lastError = String(err && err.message || err);
      });
      state.timer = setInterval(function(){ writeSample('sample'); }, intervalMs);
      return {ok:true, sessionId:state.sessionId, paths:state.paths || null};
    }
    function installMenuMinuteLogger(){
      if(window.__fateMenuMinuteLoggerInstalled) return;
      window.__fateMenuMinuteLoggerInstalled = true;
      window.fateStartMenuMinuteLog = function(options){ return startMenuMinuteLog('manual', options); };
      window.fateStopMenuMinuteLog = function(reason){ return stopMenuMinuteLog(reason || 'manual'); };
      window.fateMenuMinuteLogStatus = function(){
        const state = activeMenuMinuteLog;
        return state ? {
          running:!state.stopped,
          sessionId:state.sessionId,
          elapsedMs:Math.round(performance.now() - state.startedAt),
          samples:state.sampleCount || 0,
          paths:state.paths || null,
          latestPath:window.__fateLatestMenuMinuteLogPath || null,
          lastError:state.lastError || ''
        } : {running:false, latestPath:window.__fateLatestMenuMinuteLogPath || null};
      };
      window.addEventListener('fate-screen-changed', function(ev){
        const to = ev && ev.detail && ev.detail.to || getActiveScreenId();
        if(to === 's-game') {
          if(activeMenuMinuteLog && !activeMenuMinuteLog.stopped) stopMenuMinuteLog('entered-game-screen');
        } else {
          startMenuMinuteLog('screen-changed-to-' + to);
        }
      });
      if(!gameScreenActive()) startMenuMinuteLog('startup-menu');
    }
    function tick(now){
      const focusThrottled = !document.hasFocus();
      if(document.hidden || window.__fatePageHidden || focusThrottled){
        last = now;
        fpsWindowStart = now;
        fpsWindowFrames = 0;
        slowBurst = 0;
        lowFpsWindows = 0;
        perf.focusThrottled = !!focusThrottled;
        if(focusThrottled){
          if(!focusThrottleStartedAt) focusThrottleStartedAt = now;
          perf.focusThrottleMs = Math.round(now - focusThrottleStartedAt);
          perf.fpsStatus = 'focus-throttled';
          perf.lastLowFpsSuppressedReason = 'document-not-focused';
        } else {
          focusThrottleStartedAt = 0;
          perf.focusThrottleMs = 0;
          perf.fpsStatus = document.hidden || window.__fatePageHidden ? 'hidden' : 'active';
        }
        scheduleNextDiagnosticTick();
        return;
      }
      perf.focusThrottled = false;
      focusThrottleStartedAt = 0;
      perf.focusThrottleMs = 0;
      perf.fpsStatus = 'active';
      var delta = now - last;
      last = now;
      // Ignore very large deltas (>2s) — these come from returning after long tab switch
      // and would falsely trigger slow-frame detection.
      if(delta > 2000){
        fpsWindowStart = now;
        fpsWindowFrames = 0;
        slowBurst = 0;
        lowFpsWindows = 0;
        scheduleNextDiagnosticTick();
        return;
      }
      fpsWindowFrames += 1;
      if(now - fpsWindowStart >= 2000){
        var fps = fpsWindowFrames * 1000 / Math.max(1, now - fpsWindowStart);
        perf.lastFpsEstimate = Math.round(fps);
        var longTaskDelta = Math.max(0, (perf.longTasks || 0) - lastLongTaskCount);
        lastLongTaskCount = perf.longTasks || 0;
        perf.fpsHistory = perf.fpsHistory || [];
        perf.fpsHistory.push({
          t: Math.round(now / 1000),
          screen: getActiveScreenId(),
          fps: Math.round(fps),
          raf: perf.rafCallsPerSecond || 0,
          promise: perf.promiseThenRate || 0,
          longTasks: longTaskDelta,
          slowFrames: perf.slowFrames || 0,
          renders: (perf.renderSamples || []).length,
          offscreenRenders: perf.suppressedOffscreenGameRenders || 0,
          nodes: document.getElementsByTagName('*').length,
          recovery: perf.lastRecoveryReason || ''
        });
        if(perf.fpsHistory.length > 90) perf.fpsHistory.shift();
      if(fps < 20 && !document.hidden && !window.__fatePageHidden && document.hasFocus()) lowFpsWindows += 1;
      else { lowFpsWindows = Math.max(0, lowFpsWindows - 1); if(fps >= 40) recoveryCooldown = 8000; }
        // Firefox can get stuck at a stable 12-15 FPS after tab restore or during
        // long sessions. The reset is the part that has proven to recover it, so
        // trigger quickly for that exact band and moderately for general <20 FPS.
        if((fps <= 16 && lowFpsWindows >= 1) || lowFpsWindows >= 2){
          if((perf.nativeTimerDelayMs || 0) > 450 && typeof window.fateActivateTimerRescue === 'function') {
            window.fateActivateTimerRescue('low-fps-' + Math.round(fps), 6500);
          }
          lowFpsWindows = 0;
          softCompositorReset(now, 'sustained-low-fps-' + Math.round(fps));
          if(fps <= 16) hardCompositorReset(now, 'sustained-low-fps-' + Math.round(fps));
        }
        fpsWindowStart = now;
        fpsWindowFrames = 0;
      }
      if(delta > 34){
        perf.slowFrames += 1;
        perf.worstFrameMs = Math.max(perf.worstFrameMs || 0, delta);
      }
      scheduleNextDiagnosticTick();
    }
    try{
      if(localStorage.getItem('fateFpsWatchdogEnabled') === '1') startFpsWatchdog();
    }catch(e){}
    if('PerformanceObserver' in window && (!PerformanceObserver.supportedEntryTypes || PerformanceObserver.supportedEntryTypes.includes('longtask'))){
      try{
        const observer = new PerformanceObserver(function(list){
          const entries = list.getEntries();
          perf.longTasks += entries.length;
          perf.longTaskSamples = perf.longTaskSamples || [];
          entries.forEach(function(entry){
            perf.longTaskSamples.push({
              duration: Math.round(entry.duration * 10) / 10,
              start: Math.round(entry.startTime * 10) / 10,
              name: entry.name || 'longtask'
            });
          });
          if(perf.longTaskSamples.length > 40) perf.longTaskSamples.splice(0, perf.longTaskSamples.length - 40);
        });
        observer.observe({entryTypes:['longtask']});
      }catch(e){}
    }
    function describeMenuTarget(el){
      try{
        if(!el) return '';
        const node = el.closest ? el.closest('button,[role="button"],a,.btn,.ch-tab,.db-filter,[onclick]') : el;
        const text = String((node && (node.innerText || node.textContent)) || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        const id = node && node.id ? '#' + node.id : '';
        const cls = node && node.className && typeof node.className === 'string'
          ? '.' + node.className.split(/\s+/).filter(Boolean).slice(0, 3).join('.')
          : '';
        return (text || node?.tagName || 'target') + id + cls;
      }catch(e){
        return '';
      }
    }
    function recordMenuSample(sample){
      try{
        perf.menuSamples = perf.menuSamples || [];
        perf.menuSamples.push(Object.assign({
          at:Date.now(),
          screen:getActiveScreenId(),
          hidden:!!document.hidden,
          focus:document.hasFocus ? !!document.hasFocus() : null
        }, sample || {}));
        if(perf.menuSamples.length > 100) perf.menuSamples.splice(0, perf.menuSamples.length - 100);
      }catch(e){}
    }
    function installMenuInputTrace(){
      if(window.__fateMenuInputTraceInstalled) return;
      window.__fateMenuInputTraceInstalled = true;
      document.addEventListener('click', function(event){
        const target = event.target;
        const label = describeMenuTarget(target);
        if(!label) return;
        const t0 = performance.now();
        const startScreen = getActiveScreenId();
        requestAnimationFrame(function(){
          requestAnimationFrame(function(){
            const ms = performance.now() - t0;
            if(ms < 12) return;
            recordMenuSample({
              kind:'click-to-paint',
              name:'click-to-paint',
              ms:Math.round(ms * 10) / 10,
              label,
              screen:startScreen,
              nextScreen:getActiveScreenId()
            });
          });
        });
      }, true);
    }
    function summarizeArgs(args){
      try{
        return Array.prototype.slice.call(args, 0, 3).map(function(value){
          if(value && value.nodeType === 1) return describeMenuTarget(value);
          if(value && typeof value === 'object') return value.id || value.name || value.title || Object.prototype.toString.call(value);
          return String(value).slice(0, 48);
        }).join(', ');
      }catch(e){
        return '';
      }
    }
    function wrapPerfFunction(name, opts){
      const fn = window[name];
      if(typeof fn !== 'function' || fn.__fatePerfWrapped) return;
      window[name] = function(){
        const t0 = performance.now();
        try{ return fn.apply(this, arguments); }
        finally{
          const ms = performance.now() - t0;
          const rounded = Math.round(ms * 10) / 10;
          if(ms > (opts && opts.menu ? 8 : 12)){
            if(opts && opts.menu){
              recordMenuSample({
                kind:'function',
                name,
                ms:rounded,
                args:summarizeArgs(arguments)
              });
            }
          }
          if(ms > 12 && (!opts || opts.render !== false)){
            if(!Array.isArray(perf.renderSamples)) perf.renderSamples = [];
            perf.renderSamples.push({
              name,
              ms:rounded,
              screen:getActiveScreenId(),
              inGame: !!document.getElementById('s-game')?.classList.contains('active'),
              at:Date.now()
            });
            if(perf.renderSamples.length > 30) perf.renderSamples.shift();
          }
          const imageRoot = getRenderImageRoot(name);
          if(imageRoot && performance.now() - lastRenderImageOptimizeAt > 2500){
            lastRenderImageOptimizeAt = performance.now();
            scheduleOptimizeImages(imageRoot);
          }
        }
      };
      window[name].__fatePerfWrapped = true;
    }
    [
      'performGameRender','renderBoard','renderHand','renderOppHand','showModal'
    ].forEach(function(name){ wrapPerfFunction(name, {render:true, menu:name === 'showModal'}); });
    [
      'showScreen','openFreePlayMenu','openChallengerMenu','showDeckBuilder','showMissionControl',
      'showSocial','showPublicDecks','switchChTab','dbFilter','setCdbFilter',
      'renderDBCollection','renderDBDeck','renderChallengerPlay','renderChallengerStore',
      'renderChallengerCollection','renderChallengerDeckBuilder','renderMissionLivePanel'
    ].forEach(function(name){ wrapPerfFunction(name, {render:false, menu:true}); });
    installMenuInputTrace();
  }

  function cleanupTransientVisuals(){
    [
      '.placement-anim-ghost',
      '.effect-activation-aura',
      '.card-set-flash',
      '.zone-take-flash',
      '.final-zone-board-flash',
      '.cinematic-subtitle-live',
      '.last-turn-banner',
      '.turn-timer-warning',
      '.online-lag-spinner'
    ].forEach(function(sel){
      document.querySelectorAll(sel).forEach(function(el){
        if(sel === '.final-zone-board-flash'){
          if(typeof G !== 'undefined' && G && G._finalZoneRevealActive) return;
          el.classList.remove('final-zone-board-flash','final-zone-board-p1','final-zone-board-p2','final-zone-board-tie');
          el.style.removeProperty('--final-zone-delay');
          el.removeAttribute('data-final-zone-label');
          el.removeAttribute('data-final-zone-score');
        }
        else if(el && el.parentNode) el.remove();
      });
    });
    if(!document.querySelector('.consolidation-cinematic-overlay') && !document.querySelector('.cc-overlay-v2')) document.body.classList.remove('cinematic-lock');
    // Removed: [style*="will-change"] query is an expensive attribute selector
    // that forces full style recalc on every element. The will-change properties
    // are now managed via CSS (super-performance-mode sets will-change:auto).
  }

  function refreshAfterVisibilityRestore(){
    const restoreNow = performance.now();
    if(restoreNow - lastVisibilityRecoveryAt < 2500) return;
    lastVisibilityRecoveryAt = restoreNow;
    pendingImageRoots.clear();
    imageFlushScheduled = false;
    window.__fateLastVisibilityRestoreAt = restoreNow;
    cleanupTransientVisuals();
    if(typeof window.invalidateFateRenderCaches === 'function') window.invalidateFateRenderCaches();

    if(document.getElementById('s-game')?.classList.contains('active')){
      requestAnimationFrame(function(){
        if(typeof window.renderGame === 'function') window.renderGame({hand:true,scores:true,piles:true,landscape:true,oppHand:true,topbar:true});
      });
      return;
    }
    if(typeof window.safeRenderTitleProfile === 'function' && document.getElementById('s-title')?.classList.contains('active')){
      window.safeRenderTitleProfile();
    }
    if(typeof window.positionOnlineAccountBadgeNearTitleProfile === 'function') {
      setTimeout(function(){ window.positionOnlineAccountBadgeNearTitleProfile(); }, 60);
    }
  }

  function installVisibilityRecovery(){
    if(window.__fateVisibilityRecoveryInstalled) return;
    window.__fateVisibilityRecoveryInstalled = true;
      window.__fatePageHidden = !!document.hidden;
      let lastUserWakeAt = 0;
      function wakeFromUserInteraction(reason){
        if(document.hidden || window.__fatePageHidden) return;
        const now = performance.now();
        if(now - lastUserWakeAt < 1500) return;
        lastUserWakeAt = now;
        const perf = window.__fatePerf = window.__fatePerf || {};
        perf.focusWakeCount = (perf.focusWakeCount || 0) + 1;
        perf.lastFocusWakeReason = reason || 'interaction';
        perf.focusThrottled = false;
        perf.focusThrottleMs = 0;
        recordLifecycleEvent('user-wake', {reason:reason || 'interaction'});
        scheduleBrowserThrottleProbe('user-wake-' + (reason || 'interaction'));
        setTimeout(function(){
          window.__fatePageHidden = false;
          document.documentElement.classList.remove('fate-tab-hidden','fate-frame-recovery');
          if(document.body) document.body.classList.remove('fate-frame-recovery');
          refreshAfterVisibilityRestore();
      }, 0);
    }
    window.fateWakeFromFocusThrottle = function(){ wakeFromUserInteraction('manual'); };
    function setHiddenState(hidden){
      window.__fatePageHidden = !!hidden;
      const perf = window.__fatePerf = window.__fatePerf || {};
      if(!hidden && (!document.hasFocus || document.hasFocus())){
        perf.focusThrottled = false;
        perf.focusThrottleMs = 0;
        perf.fpsStatus = 'active';
      }
      recordLifecycleEvent(hidden ? 'hidden' : 'visible');
      if(!hidden) scheduleBrowserThrottleProbe('visible');
      // Only toggle on html — CSS selectors target html.fate-tab-hidden.
      // Toggling on body too doubles the style recalculation cost for no benefit.
      document.documentElement.classList.toggle('fate-tab-hidden', !!hidden);
      if(hidden){
        if(typeof window.fatePauseMusicForHidden === 'function') window.fatePauseMusicForHidden();
      }else{
        if(typeof window.fateNormalizeBridgeTimers === 'function') window.fateNormalizeBridgeTimers();
        if(typeof window.fateResumeMusicAfterHidden === 'function') window.fateResumeMusicAfterHidden();
        refreshAfterVisibilityRestore();
      }
    }
    document.addEventListener('visibilitychange', function(){ setHiddenState(document.hidden); });
    window.addEventListener('focus', function(){
      const perf = window.__fatePerf = window.__fatePerf || {};
      perf.focusThrottled = false;
      perf.focusThrottleMs = 0;
      perf.fpsStatus = 'active';
      recordLifecycleEvent('focus');
      scheduleBrowserThrottleProbe('focus');
      window.__fatePageHidden = false;
      document.documentElement.classList.remove('fate-tab-hidden');
      if(typeof window.fateNormalizeBridgeTimers === 'function') window.fateNormalizeBridgeTimers();
      refreshAfterVisibilityRestore();
    });
    ['pointerdown','keydown','touchstart'].forEach(function(type){
      window.addEventListener(type, function(){ wakeFromUserInteraction(type); }, {capture:true, passive:true});
    });
    window.addEventListener('blur', function(){
      const perf = window.__fatePerf = window.__fatePerf || {};
      perf.focusThrottled = true;
      recordLifecycleEvent('blur');
    });
    window.addEventListener('pagehide', function(){ recordLifecycleEvent('pagehide'); setHiddenState(true); });
    window.addEventListener('pageshow', function(){ recordLifecycleEvent('pageshow'); setHiddenState(document.hidden); });
    window.addEventListener('resize', function(){ recordLifecycleEvent('resize'); }, {passive:true});
    window.addEventListener('resize', function(){ scheduleBrowserThrottleProbe('resize'); }, {passive:true});
  }

  function init(){
    const electronShell = isElectronShell();
    document.documentElement.classList.add('fate-smooth-runtime');
    document.body && document.body.classList.add('fate-smooth-runtime');
    installVisibleTimerBridge();
    try{
      const perf = window.__fatePerf = window.__fatePerf || {};
      perf.rafMonitorEnabled = false;
      if(localStorage.getItem('fateRafMonitorEnabled') === '1') installRafMonitor();
    }catch(e){}
    requestAnimationFrame(function(){ idle(function(){ optimizeImages(document); }); });
    installObserver();
    installFrameDiagnostics();
    installVisibilityRecovery();
    installMenuMinuteLogger();
    installMatchWarmup();
    const timer = window.__fateNativeSetTimeout || window.setTimeout;
    if(electronShell) timer(warmTitleOpenAssets, 1200);
    else warmTitleOpenAssets();
    scheduleBackgroundInitialPreload();
    if(!electronShell) idle(warmGameAssets);
  }

  window.fatePreloadInitialAssets = preloadInitialAssets;

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
