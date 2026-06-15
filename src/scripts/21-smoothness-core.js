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
  let startupWarmupEpoch = 0;
  let matchEntryEpoch = 0;
  let matchWarmupTimers = [];
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

  function waitMatchPreloadMs(ms){
    return new Promise(function(resolve){ setTimeout(resolve, Math.max(0, Number(ms) || 0)); });
  }

  function warmImage(src, options){
    const opts = options || {};
    if(!src || warmCache.has(src)) return Promise.resolve({src:src || '', cached:true, ok:!!src});
    if(typeof FATE_BACKGROUND_URL === 'function' && /backgrounds|titlscreenbackgrounds|ingamebackgrouds/.test(src)) src = FATE_BACKGROUND_URL(src);
    if(warmCache.has(src)) return Promise.resolve({src, cached:true, ok:true});
    warmCache.add(src);
    return new Promise(function(resolve){
      let done = false;
      const finish = function(ok, extra){
        if(done) return;
        done = true;
        resolve(Object.assign({src, cached:false, ok:!!ok}, extra || {}));
      };
      const img = new Image();
      const timeout = setTimeout(function(){ finish(false, {timeout:true}); }, Math.max(800, Number(opts.timeoutMs) || 2800));
      try{ img.decoding = 'async'; }catch(e){}
      img.onload = function(){
        if(opts.decode !== false && typeof img.decode === 'function') {
          img.decode().then(function(){
            clearTimeout(timeout);
            finish(true, {decoded:true, width:img.naturalWidth || img.width || 0, height:img.naturalHeight || img.height || 0});
          }).catch(function(){
            clearTimeout(timeout);
            finish(true, {decoded:false, width:img.naturalWidth || img.width || 0, height:img.naturalHeight || img.height || 0});
          });
          return;
        }
        clearTimeout(timeout);
        finish(true, {decoded:false, width:img.naturalWidth || img.width || 0, height:img.naturalHeight || img.height || 0});
      };
      img.onerror = function(){
        clearTimeout(timeout);
        finish(false, {error:true});
      };
      img.src = src;
      if(img.complete && (img.naturalWidth || img.width)) img.onload();
    });
  }

  function warmCardTexture(card, options){
    if(!card || !card.img) return 0;
    const opts = options || {};
    const thumb = typeof window.getRuntimeCardImageSrc === 'function' ? window.getRuntimeCardImageSrc(card.img, 'thumb') : card.img;
    const full = card.img;
    warmImage(thumb, {decode:opts.decode !== false});
    if(opts.fullArt) warmImage(full, {decode:false});
    const cache = window.FateCardTextureCache;
    if(!cache) return 1;
    try {
      const visual = Object.assign({}, card.visual || {}, {
        runtimeImg:thumb,
        img:full,
        name:card.name,
        rarity:card.rarity,
        aff:card.aff
      });
      if(typeof cache.preload === 'function') cache.preload(thumb, {source:opts.source || 'match-prewarm'});
      if(typeof cache.getBaseCardTexture === 'function') {
        const dpr = Math.min(2, Math.max(1.5, Number(window.devicePixelRatio || 1)));
        const source = opts.source || 'match-prewarm';
        cache.getBaseCardTexture(card, {w:74, h:104}, {visual, dpr, preferFullArt:true, source:source + '-hand'});
        if(!opts.light) cache.getBaseCardTexture(card, {w:96, h:134}, {visual, dpr, preferFullArt:true, source:source + '-board'});
      }
    } catch(e) {}
    return 1;
  }

  function waitForTextureRecords(records, timeoutMs){
    const list = (records || []).filter(Boolean);
    const started = performance.now();
    return new Promise(function(resolve){
      function finish(reason){
        const pending = list.filter(function(rec){ return rec && rec.pending && !rec.loaded && !rec.failed; }).length;
        const loaded = list.filter(function(rec){ return rec && rec.loaded; }).length;
        const failed = list.filter(function(rec){ return rec && rec.failed; }).length;
        resolve({reason, loaded, failed, pending, total:list.length});
      }
      function tick(){
        const pending = list.some(function(rec){ return rec && rec.pending && !rec.loaded && !rec.failed; });
        if(!pending) return finish('ready');
        if(performance.now() - started >= timeoutMs) return finish('timeout');
        setTimeout(tick, 80);
      }
      tick();
    });
  }

  async function warmMatchAssetsNow(options){
    const opts = options || {};
    const started = performance.now();
    const perf = window.__fatePerf = window.__fatePerf || {};
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : function(){};
    const source = opts.source || 'matchup-loader';
    const maxCards = Math.max(20, Math.min(120, Number(opts.maxCards) || 80));
    const cards = collectMatchWarmCards({light:false}).slice(0, maxCards);
    const dpr = Math.min(2, Math.max(1.5, Number(window.devicePixelRatio || 1)));
    const records = [];
    const staticAssets = ['blank.png','back.png','deck.png'];
    let warmedCards = 0;
    let imageOk = 0;
    let imageFailed = 0;
    const total = Math.max(1, cards.length + staticAssets.length + 2);
    const publish = function(stage, done, extra){
      const item = Object.assign({
        stage,
        done,
        total,
        progress:Math.max(0, Math.min(1, done / total)),
        cards:warmedCards
      }, extra || {});
      perf.matchWarmupProgress = item;
      onProgress(item);
    };
    publish('collect', 0, {cardCount:cards.length});
    for(let i = 0; i < cards.length; i++){
      const card = cards[i];
      const thumb = typeof window.getRuntimeCardImageSrc === 'function' ? window.getRuntimeCardImageSrc(card.img, 'thumb') : card.img;
      const full = card.img;
      const visual = Object.assign({}, card.visual || {}, {
        runtimeImg:thumb,
        img:full,
        name:card.name,
        rarity:card.rarity,
        aff:card.aff
      });
      const imgResult = await warmImage(thumb, {decode:true, timeoutMs:3200});
      if(imgResult && imgResult.ok) imageOk += 1;
      else imageFailed += 1;
      if(full && full !== thumb) warmImage(full, {decode:false, timeoutMs:3200});
      const cache = window.FateCardTextureCache;
      if(cache && typeof cache.getBaseCardTexture === 'function'){
        try{
          records.push(cache.getBaseCardTexture(card, {w:74, h:104}, {visual, dpr, preferFullArt:true, source:source + '-hand'}));
          records.push(cache.getBaseCardTexture(card, {w:96, h:134}, {visual, dpr, preferFullArt:true, source:source + '-board'}));
        }catch(e){}
      }
      warmedCards += 1;
      publish('cards', Math.min(total - 2, warmedCards), {cardName:card.name || '', imageOk, imageFailed});
      if(i % 4 === 3) await waitMatchPreloadMs(0);
    }
    for(let i = 0; i < staticAssets.length; i++){
      const result = await warmImage(staticAssets[i], {decode:true, timeoutMs:2200});
      if(result && result.ok) imageOk += 1;
      else imageFailed += 1;
      publish('static', cards.length + i + 1, {asset:staticAssets[i], imageOk, imageFailed});
    }
    if(window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.prewarmAssetImages === 'function') {
      try {
        await window.FateMatchRendererAdapter.prewarmAssetImages(staticAssets);
      } catch(e) {}
    }
    if(typeof window.fateWarmMenuAudioSamples === 'function') {
      window.fateWarmMenuAudioSamples([
        'supporterSet',
        'characterSet',
        'characterSet_Initiator',
        'characterSet_Coordinator',
        'characterSet_Dauntless',
        'characterSet_Improvisor',
        'place',
        'starPlace',
        'coinFlip'
      ]);
    }
    if(typeof window.fateWarmSyntheticSfx === 'function') {
      window.fateWarmSyntheticSfx(['draw','place','consolidate','discard']);
    }
    publish('textures', total - 1, {records:records.length});
    const textureWait = await waitForTextureRecords(records, Math.max(1200, Number(opts.textureTimeoutMs) || 4200));
    const report = {
      at:Math.round(performance.now()),
      ms:Math.round((performance.now() - started) * 10) / 10,
      source,
      cards:warmedCards,
      imageOk,
      imageFailed,
      textureRecords:records.length,
      textureWait,
      textureCache:window.FateCardTextureCache && typeof window.FateCardTextureCache.report === 'function'
        ? window.FateCardTextureCache.report()
        : null
    };
    perf.matchWarmup = report;
    publish('ready', total, report);
    recordLifecycleEvent('match-preload-complete', report);
    return report;
  }

  function collectMatchWarmCards(options){
    const opts = options || {};
    const g = (typeof G !== 'undefined' && G) ? G : null;
    const cards = [];
    if(!g || !Array.isArray(g.players)) return cards;
    g.players.forEach(function(player){
      if(!player) return;
      cards.push(...((player.hand || []).slice(0, 8)));
      cards.push(...((player.deck || []).slice(0, opts.light ? 8 : 18)));
      if(!opts.light) cards.push(...((player.discard || []).slice(-4)));
    });
    (g.board || []).forEach(function(zone){
      (zone || []).forEach(function(row){
        (row || []).forEach(function(card){ if(card) cards.push(card); });
      });
    });
    const seen = new Set();
    return cards.filter(function(card){
      if(!card || !card.img) return false;
      const key = String(card.iid || '') + '|' + String(card.id || '') + '|' + String(card.img || '');
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const menuSchedulerState = {
    queue:[],
    running:false,
    completed:0,
    cancelled:0,
    lastTask:'',
    lastError:'',
    lastRunMs:0
  };

  function ensureMenuScheduler(){
    if(window.FateMenuScheduler) return window.FateMenuScheduler;
    const scheduler = {
      enqueue:function(label, task, options){
        const opts = options || {};
        if(typeof task !== 'function') return false;
        menuSchedulerState.queue.push({
          label:String(label || 'menu-task'),
          task,
          priority:Number(opts.priority) || 0,
          timeoutMs:Math.max(120, Number(opts.timeoutMs) || 1200)
        });
        menuSchedulerState.queue.sort((a,b)=>b.priority - a.priority);
        scheduleMenuSchedulerDrain();
        return true;
      },
      cancel:function(reason){
        menuSchedulerState.cancelled += menuSchedulerState.queue.length;
        menuSchedulerState.queue.length = 0;
        menuSchedulerState.running = false;
        menuSchedulerState.lastError = reason || 'cancelled';
      },
      report:function(){
        return {
          queued:menuSchedulerState.queue.length,
          running:menuSchedulerState.running,
          completed:menuSchedulerState.completed,
          cancelled:menuSchedulerState.cancelled,
          lastTask:menuSchedulerState.lastTask,
          lastError:menuSchedulerState.lastError,
          lastRunMs:menuSchedulerState.lastRunMs
        };
      }
    };
    window.FateMenuScheduler = scheduler;
    return scheduler;
  }

  function scheduleMenuSchedulerDrain(){
    if(menuSchedulerState.running) return;
    menuSchedulerState.running = true;
    const schedule = window.requestIdleCallback || function(fn){ return setTimeout(function(){ fn({timeRemaining:function(){return 8;}}); }, 40); };
    schedule(drainMenuScheduler, {timeout:900});
  }

  function drainMenuScheduler(deadline){
    if(isStartupGameFlowActive()){
      ensureMenuScheduler().cancel('game-flow-active');
      return;
    }
    const timeRemaining = deadline && typeof deadline.timeRemaining === 'function'
      ? deadline.timeRemaining.bind(deadline)
      : function(){ return 6; };
    const task = menuSchedulerState.queue.shift();
    if(!task){
      menuSchedulerState.running = false;
      return;
    }
    const started = performance.now();
    menuSchedulerState.lastTask = task.label;
    Promise.race([
      Promise.resolve().then(task.task),
      waitStartupMs(task.timeoutMs)
    ]).then(function(){
      menuSchedulerState.completed += 1;
    }, function(err){
      menuSchedulerState.lastError = task.label + ': ' + String(err && err.message || err);
    }).then(function(){
      menuSchedulerState.lastRunMs = Math.round(performance.now() - started);
      menuSchedulerState.running = false;
      if(menuSchedulerState.queue.length && timeRemaining() > 1) scheduleMenuSchedulerDrain();
      else if(menuSchedulerState.queue.length) setTimeout(scheduleMenuSchedulerDrain, 80);
    });
  }

  function clearMatchWarmupTimers(){
    if(!matchWarmupTimers.length) return;
    matchWarmupTimers.forEach(function(id){ try{ clearTimeout(id); }catch(e){} });
    matchWarmupTimers = [];
  }

  function markMatchEntry(reason){
    matchEntryEpoch += 1;
    const perf = window.__fatePerf = window.__fatePerf || {};
    perf.matchEntry = {
      epoch:matchEntryEpoch,
      reason:reason || 'match-entry',
      at:Math.round(performance.now()),
      until:Math.round(performance.now() + (isElectronShell() ? 3200 : 1800))
    };
    clearMatchWarmupTimers();
    return matchEntryEpoch;
  }

  function cancelStartupWarmup(reason){
    startupWarmupEpoch += 1;
    window.__fateStartupWarmupCancelled = true;
    window.__fateStartupWarmupActive = false;
    pendingImageRoots.clear();
    imageFlushScheduled = false;
    clearMatchWarmupTimers();
    const perf = window.__fatePerf = window.__fatePerf || {};
    perf.startupWarmupCancelled = {
      reason:reason || 'cancelled',
      at:Math.round(performance.now()),
      epoch:startupWarmupEpoch
    };
    recordLifecycleEvent('startup-warmup-cancelled', perf.startupWarmupCancelled);
  }

  function warmGameAssets(options){
    const opts = options || {};
    const electronMatch = isElectronShell() && document.getElementById('s-game')?.classList.contains('active');
    const perf = window.__fatePerf = window.__fatePerf || {};
    const progress = perf.matchWarmupProgress || null;
    if(progress && progress.source === 'matchup-loader' && progress.stage === 'ready' && /^pre-match-/.test(String(opts.source || ''))) {
      perf.matchWarmupSkipped = {
        at:Math.round(performance.now()),
        reason:'matchup-loader-already-ready',
        source:opts.source || '',
        policy:'legacy-pre-match-warmup-disabled'
      };
      return;
    }
    if(electronMatch && !opts.force){
      perf.matchWarmupSkipped = {
        at:Math.round(performance.now()),
        reason:'electron-active-match',
        policy:'hidden-match-image-warmup-disabled'
      };
      return;
    }
    idle(function(){
      try{
        const active = collectMatchWarmCards(opts).slice(0, opts.light ? 32 : 60);
        let warmed = 0;
        active.forEach(function(card){
          warmed += warmCardTexture(card, {
            light:!!opts.light,
            fullArt:!opts.light,
            decode:!opts.light,
            source:opts.source || 'match-prewarm'
          });
        });
        if(typeof window.fateWarmMenuAudioSamples === 'function') {
          window.fateWarmMenuAudioSamples([
            'supporterSet',
            'characterSet',
            'characterSet_Initiator',
            'characterSet_Coordinator',
            'characterSet_Dauntless',
            'characterSet_Improvisor',
            'place',
            'starPlace'
          ]);
        }
        if(!opts.light && typeof window.fateWarmSyntheticSfx === 'function') {
          window.fateWarmSyntheticSfx(['draw','place','consolidate','discard']);
        }
        const latestProgress = perf.matchWarmupProgress || null;
        if(latestProgress && latestProgress.source === 'matchup-loader' && latestProgress.stage === 'ready' && /^pre-match-/.test(String(opts.source || ''))) {
          perf.matchWarmupSkipped = {
            at:Math.round(performance.now()),
            reason:'matchup-loader-already-ready',
            source:opts.source || '',
            policy:'legacy-pre-match-report-suppressed'
          };
          return;
        }
        perf.matchWarmup = {
          at:Math.round(performance.now()),
          light:!!opts.light,
          force:!!opts.force,
          source:opts.source || '',
          cards:warmed,
          textureCache:window.FateCardTextureCache && typeof window.FateCardTextureCache.report === 'function'
            ? window.FateCardTextureCache.report()
            : null
        };
      }catch(e){}
      ['blank.png','back.png','deck.png'].forEach(function(src){ warmImage(src, {decode:!opts.light}); });
    });
  }

  function collectInitialAssets(){
    const assets = new Set(['blank.png','back.png','deck.png','booster1.png','pfpbooster.png']);
    ['play1.png','play2.png','Illustration3.png'].forEach(name=>assets.add(name));
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

  function showInitialLoadingScreen(total, options){
    const opts = options || {};
    const existing = document.getElementById('fate-loading-screen');
    if(existing) {
      existing.classList.remove('is-hiding','fate-loading-assets-done');
      const title = existing.querySelector('.fate-loading-title');
      const copy = existing.querySelector('.fate-loading-copy');
      if(title && opts.title) title.textContent = opts.title;
      if(copy && opts.copy) copy.textContent = opts.copy;
      updateInitialLoadingScreen(0, total || 0);
      return;
    }
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
        <div class="fate-loading-title">${opts.title || 'Loading Assets'}</div>
        <div class="fate-loading-copy">${opts.copy || 'Preparing cards, portraits, backgrounds, and match UI.'}</div>
        <div class="fate-loading-bar"><div id="fate-loading-fill"></div></div>
        <div class="fate-loading-count" id="fate-loading-count">0 / ${total}</div>
      </div>`;
    document.body.appendChild(overlay);
  }

  function updateInitialLoadingScreen(done, total, label){
    const fill = document.getElementById('fate-loading-fill');
    const count = document.getElementById('fate-loading-count');
    const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 100;
    if(fill) fill.style.width = pct + '%';
    if(count) count.textContent = label || `${done} / ${total}`;
  }

  function updateInitialLoadingStage(title, copy){
    const overlay = document.getElementById('fate-loading-screen');
    if(!overlay) return;
    const titleEl = overlay.querySelector('.fate-loading-title');
    const copyEl = overlay.querySelector('.fate-loading-copy');
    if(titleEl && title) titleEl.textContent = title;
    if(copyEl && copy) copyEl.textContent = copy;
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
      if(typeof opts.shouldCancel === 'function' && opts.shouldCancel()) { resolve(src); return; }
      const img = new Image();
      let done = false;
      const finish = ()=>{
        if(done) return;
        done = true;
        resolve(src);
      };
      const timer = setTimeout(finish, Number(opts.timeoutMs) || 3500);
      if(typeof opts.shouldCancel === 'function' && opts.shouldCancel()) {
        clearTimeout(timer);
        finish();
        return;
      }
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
    const preloadEpoch = startupWarmupEpoch;
    const shouldCancel = function(){
      return !!(
        window.__fateStartupWarmupCancelled ||
        startupWarmupEpoch !== preloadEpoch ||
        (typeof opts.shouldCancel === 'function' && opts.shouldCancel()) ||
        (background && isStartupGameFlowActive())
      );
    };
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
        if(typeof opts.onProgress === 'function') opts.onProgress(done, total);
        else updateInitialLoadingScreen(done, total);
      }
    }
    const electronShell = isElectronShell();
    const workerCount = background
      ? Math.min(electronShell ? 1 : 3, total)
      : Math.min(electronShell ? 2 : 4, total);
    const workers = Array.from({length:workerCount}, async function(){
      while(assets.length){
        if(shouldCancel()) break;
        const src = assets.shift();
        await preloadImage(src, {timeoutMs:background ? 1800 : 3500, shouldCancel});
        if(shouldCancel()) break;
        warmCache.add(src);
        done += 1;
        maybePaintLoadingProgress(false);
        if(background ? done % 4 === 0 : true) await new Promise(resolve=>setTimeout(resolve, 0));
      }
    });
    const minTime = background ? Promise.resolve() : new Promise(resolve=>setTimeout(resolve, 650));
    const hardStop = new Promise(resolve=>setTimeout(resolve, background ? 6500 : 9000));
    return Promise.race([Promise.all(workers), hardStop])
      .then(()=>minTime)
      .then(()=>{
        if(shouldCancel()) return;
        if(performance.now() - startedAt > 150) {
          done = total;
          maybePaintLoadingProgress(true);
        }
        if(!background && !opts.keepVisible) hideInitialLoadingScreen();
      });
  }

  function waitStartupFrame(count){
    let remaining = Math.max(1, Number(count) || 1);
    return new Promise(resolve=>{
      function step(){
        remaining -= 1;
        if(remaining <= 0) resolve();
        else requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  function waitStartupMs(ms){
    return new Promise(resolve=>setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  async function forceWarmLayout(root, limit){
    try{
      const base = root && root.querySelectorAll ? root : document;
      base.getBoundingClientRect && base.getBoundingClientRect();
      const max = Math.max(12, Number(limit) || 56);
      const nodes = Array.from(base.querySelectorAll('button,img,.btn,.db-collection,.ch-content,.modal,.starter-deck-card,.coll-card')).slice(0, max);
      for(let i = 0; i < nodes.length; i += 14){
        nodes.slice(i, i + 14).forEach(function(el){
          if(el && el.getBoundingClientRect) el.getBoundingClientRect();
        });
        await waitStartupFrame(1);
      }
    }catch(e){}
  }

  async function warmVisibleImages(root, limit){
    const base = root && root.querySelectorAll ? root : document;
    const imgs = Array.from(base.querySelectorAll('img')).slice(0, Math.max(1, Number(limit) || 36));
    const deadline = performance.now() + 700;
    for(let i = 0; i < imgs.length; i += 4){
      const batch = imgs.slice(i, i + 4);
      await Promise.race([
        Promise.all(batch.map(function(img){
          try{
            img.loading = 'eager';
            img.decoding = 'async';
            img.fetchPriority = 'high';
            if(img.complete && img.naturalWidth > 0) return Promise.resolve();
            if(typeof img.decode === 'function') return img.decode().catch(()=>{});
          }catch(e){}
          return Promise.resolve();
        })),
        waitStartupMs(180)
      ]);
      await waitStartupFrame(1);
      if(performance.now() > deadline) break;
    }
  }

  async function runStartupStep(state, label, copy, task){
    if(state.cancelled) return;
    if(isStartupGameFlowActive()){
      state.cancelled = true;
      return;
    }
    updateInitialLoadingStage(label, copy);
    updateInitialLoadingScreen(state.done, state.total, `${state.done} / ${state.total}`);
    await waitStartupFrame(1);
    if(state.cancelled) return;
    try{ await task(); }catch(e){ state.errors.push({label, error:String(e && e.message || e)}); }
    state.done = Math.min(state.total, state.done + 1);
    updateInitialLoadingScreen(state.done, state.total, `${state.done} / ${state.total}`);
    await waitStartupMs(20);
  }

  function isStartupGameFlowActive(){
    const screen = getActiveScreenId();
    return screen === 's-coin' || screen === 's-game' || screen === 's-matchmaking';
  }

  function cleanupStartupWarmupOverlays(){
    try{
      if(typeof window.closeMissionControl === 'function') {
        try { window.closeMissionControl(); } catch(e) {}
      } else {
        const mission = document.getElementById('mission-control-window');
        if(mission) {
          mission.classList.remove('on');
          mission.hidden = true;
        }
        if(document.body) document.body.classList.remove('mission-control-open');
      }
      const difficulty = document.getElementById('s-difficulty-overlay');
      if(difficulty) difficulty.classList.remove('on','no-edge-corners-modal');
      const preset = document.getElementById('s-preset-overlay');
      if(preset) preset.classList.remove('on','no-edge-corners-modal');
      if(document.body) {
        document.body.classList.remove('ai-preset-overlay-open','choose-deck-open');
      }
      const modal = document.getElementById('modal');
      if(modal) {
        modal.classList.remove('on');
        delete modal.dataset.chooseDeckOpen;
      }
      const modalBox = document.querySelector('#modal .modal');
      if(modalBox) {
        modalBox.classList.remove('choose-deck-canonical-modal','choose-deck-runtime-modal','freeplay-mode-modal');
      }
    }catch(e){}
  }

  function installStartupWarmupOverlayGuard(){
    if(window.__fateStartupWarmupOverlayGuardInstalled) return;
    window.__fateStartupWarmupOverlayGuardInstalled = true;
    window.addEventListener('fate-screen-changed', function(ev){
      const to = ev && ev.detail && ev.detail.to || getActiveScreenId();
      if(to === 's-coin' || to === 's-game' || to === 's-matchmaking') {
        cancelStartupWarmup('screen-changed-to-' + to);
        if(to === 's-game') markMatchEntry('screen-changed-to-game');
        cleanupStartupWarmupOverlays();
      }
    });
  }

  function installWarmupSilence(){
    const originals = {
      playSfx: window.playSfx,
      playMenuSfx: window.playMenuSfx,
      onScreenChange: window.onScreenChange,
      toast: window.toast
    };
    window.__fateStartupWarmupActive = true;
    try{ window.playSfx = function(){}; }catch(e){}
    try{ window.playMenuSfx = function(){}; }catch(e){}
    try{ window.onScreenChange = function(){}; }catch(e){}
    try{ window.toast = function(){}; }catch(e){}
    return function restore(){
      try{ if(originals.playSfx) window.playSfx = originals.playSfx; }catch(e){}
      try{ if(originals.playMenuSfx) window.playMenuSfx = originals.playMenuSfx; }catch(e){}
      try{ if(originals.onScreenChange) window.onScreenChange = originals.onScreenChange; }catch(e){}
      try{ if(originals.toast) window.toast = originals.toast; }catch(e){}
      window.__fateStartupWarmupActive = false;
    };
  }

  async function warmDeckBuilderMenu(){
    if(typeof window.showDeckBuilder !== 'function') return;
    window.showDeckBuilder();
    await waitStartupFrame(3);
    await waitStartupMs(220);
    const root = document.getElementById('s-deck');
    if(window.FateSVG && typeof window.FateSVG.decorate === 'function') window.FateSVG.decorate(root);
    await forceWarmLayout(root, 64);
    await warmVisibleImages(root, 28);
  }

  async function warmFreePlayMenu(){
    if(typeof window.openFreePlayMenu !== 'function') return;
    if(typeof window.fateWarmFreePlayMenuAssets === 'function') await window.fateWarmFreePlayMenuAssets();
    window.openFreePlayMenu();
    await waitStartupFrame(2);
    const modal = document.getElementById('modal');
    if(window.FateSVG && typeof window.FateSVG.decorate === 'function') window.FateSVG.decorate(modal);
    await forceWarmLayout(modal, 36);
    await warmVisibleImages(modal, 8);
    if(typeof window.closeModal === 'function') window.closeModal();
  }

  async function warmAiPickerMenu(){
    if(typeof window.showAIDifficultyPicker !== 'function') return;
    if(typeof window.fateWarmAIPickerAssets === 'function') await window.fateWarmAIPickerAssets();
    window.showAIDifficultyPicker();
    await waitStartupFrame(2);
    const overlay = document.getElementById('s-difficulty-overlay');
    await forceWarmLayout(overlay, 48);
    await warmVisibleImages(overlay, 18);
    cleanupStartupWarmupOverlays();
  }

  async function warmChooseDeckMenu(){
    const fn = window.renderFreePlayTitlePresetDeckPickModal
      || window.renderChallengerDeckPickModal
      || window.showFreePlayTitlePresetModal
      || window.showTitlePresetModal
      || window.showDeckPickModal;
    if(typeof fn !== 'function') return;
    try {
      if(fn === window.renderFreePlayTitlePresetDeckPickModal || fn === window.renderChallengerDeckPickModal) fn.call(window, 0);
      else fn.call(window);
    } catch(e) { return; }
    await waitStartupFrame(2);
    const modal = document.getElementById('modal');
    if(window.FateSVG && typeof window.FateSVG.decorate === 'function') window.FateSVG.decorate(modal);
    await forceWarmLayout(modal, 54);
    await warmVisibleImages(modal, 16);
    cleanupStartupWarmupOverlays();
  }

  function prepareChallengerWarmupScreen(){
    if(typeof window.showScreen === 'function') window.showScreen('s-challenger');
    if(typeof window.seedBuiltInPresets === 'function') window.seedBuiltInPresets();
    if(typeof window.syncStarterPresetMetadata === 'function') window.syncStarterPresetMetadata();
    if(typeof window.fateWarmChallengerMenuAssets === 'function') window.fateWarmChallengerMenuAssets();
    if(typeof window.preloadChallengerAssets === 'function') window.preloadChallengerAssets();
  }

  async function warmSocialMenu(){
    if(typeof window.fateWarmSocialMenuAssets === 'function') await window.fateWarmSocialMenuAssets();
    if(typeof window.showSocial !== 'function') return;
    window.showSocial();
    await waitStartupFrame(2);
    const root = document.getElementById('s-social');
    if(window.FateSVG && typeof window.FateSVG.decorate === 'function') window.FateSVG.decorate(root);
    await forceWarmLayout(root, 42);
    await warmVisibleImages(root, 18);
  }

  async function warmChallengerTab(tab){
    prepareChallengerWarmupScreen();
    const content = document.getElementById('ch-content');
    const renderers = {
      play:window.renderChPlayTab,
      store:window.renderChStoreTab,
      collection:window.renderChCollectionTab,
      deckbuilder:window.renderChDeckBuilderTab
    };
    const render = renderers[tab];
    if(!content || typeof render !== 'function') return;
    try{
      if(typeof window.switchChTab === 'function') {
        window.switchChTab(tab, {force:true, warmup:true});
      } else {
        content.classList.toggle('ch-cdb-content', tab === 'deckbuilder');
        render(content);
        document.querySelectorAll('.ch-tab').forEach(t=>t.classList.toggle('active', t.dataset.tab === tab));
      }
      const pane = content.querySelector(':scope > .ch-tab-pane[data-tab="'+tab+'"]') || content;
      if(window.FateSVG && typeof window.FateSVG.decorate === 'function') window.FateSVG.decorate(pane);
    }catch(e){}
    await waitStartupFrame(2);
    const pane = content.querySelector(':scope > .ch-tab-pane[data-tab="'+tab+'"]') || content;
    await forceWarmLayout(pane, tab === 'collection' ? 72 : 52);
    await warmVisibleImages(pane, tab === 'collection' ? 32 : 20);
  }

  async function warmMissionMenu(){
    if(typeof window.renderMissionDaily === 'function') window.renderMissionDaily();
    const root = document.getElementById('mission-control-window') || document.getElementById('s-mission-legacy');
    if(window.FateSVG && typeof window.FateSVG.decorate === 'function') window.FateSVG.decorate(root);
    await forceWarmLayout(root, 36);
    await waitStartupFrame(1);
    if(typeof window.closeMissionControl === 'function') {
      try { window.closeMissionControl(); } catch(e) {}
    }
  }

  function scheduleBackgroundMenuPreloads(){
    if(window.__fateBackgroundMenuPreloadsQueued) return;
    window.__fateBackgroundMenuPreloadsQueued = true;
    const scheduler = ensureMenuScheduler();
    scheduler.enqueue('challenger-assets', function(){
      if(typeof window.fateWarmChallengerMenuAssets === 'function') return window.fateWarmChallengerMenuAssets();
      if(typeof window.preloadChallengerAssets === 'function') return window.preloadChallengerAssets();
    }, {priority:4, timeoutMs:900});
    scheduler.enqueue('social-assets', function(){
      if(typeof window.fateWarmSocialMenuAssets === 'function') return window.fateWarmSocialMenuAssets();
    }, {priority:3, timeoutMs:900});
    scheduler.enqueue('menu-audio', function(){
      if(typeof window.fateWarmMenuAudioSamples === 'function') return window.fateWarmMenuAudioSamples();
    }, {priority:1, timeoutMs:600});
  }

  function waitForStartupEvent(eventName, predicate, timeoutMs){
    return new Promise(resolve=>{
      let done = false;
      let timer = 0;
      const finish = value=>{
        if(done) return;
        done = true;
        if(timer) clearTimeout(timer);
        window.removeEventListener(eventName, onEvent);
        resolve(value);
      };
      const onEvent = ev=>{
        try{
          if(!predicate || predicate(ev)) finish(ev);
        }catch(e){
          finish(ev);
        }
      };
      window.addEventListener(eventName, onEvent);
      timer = setTimeout(()=>finish(null), timeoutMs || 1);
    });
  }

  async function waitForProfileDataForMenuWarmup(){
    const perf = window.__fatePerf = window.__fatePerf || {};
    const started = performance.now();
    const status = {
      onlineModule:'not-requested',
      authReady:false,
      cloudReady:!!window._fateCloudReady,
      ms:0
    };
    perf.startupProfileWarmup = status;
    function readProfileReadiness(){
      const p = typeof USER_PROFILE !== 'undefined' ? USER_PROFILE : null;
      const presets = p && p.challengerPresets ? Object.keys(p.challengerPresets).length : 0;
      const owned = p && p.ownedCards ? Object.keys(p.ownedCards).length : 0;
      return {
        ready:!!(p && (p.starterChosen || presets > 0 || owned > 0 || p._fateAccountUid)),
        presets,
        owned,
        starterChosen:!!(p && p.starterChosen)
      };
    }
    try{
      if(typeof window.FateOnlineReady === 'function'){
        updateInitialLoadingStage('Syncing Profile', 'Loading account and collection data before menu warmup.');
        const onlineResult = await Promise.race([
          Promise.resolve().then(()=>window.FateOnlineReady()),
          waitStartupMs(isElectronShell() ? 30000 : 10000).then(()=>null)
        ]);
        status.onlineModule = onlineResult ? 'loaded' : 'timeout';
      } else {
        status.onlineModule = 'unavailable';
      }
    }catch(e){
      status.onlineModule = 'error';
      status.error = String(e && e.message || e);
    }

    let authState = window.FATE_ONLINE || null;
    let profileState = readProfileReadiness();
    if(!authState || authState.ready !== true){
      if(!profileState.ready){
        updateInitialLoadingStage('Syncing Profile', 'Waiting for sign-in state.');
        const ev = await waitForStartupEvent('fate-online-auth', ev=>!!(ev && ev.detail && ev.detail.ready), isElectronShell() ? 18000 : 8000);
        if(ev && ev.detail) authState = ev.detail;
        else authState = window.FATE_ONLINE || authState;
      }
    } else {
      authState = window.FATE_ONLINE || authState;
    }
    status.authReady = !!(authState && authState.ready);

    if(authState && authState.user && window._fateCloudReady !== true){
      updateInitialLoadingStage('Syncing Profile', 'Loading cloud profile and deck data.');
      await waitForStartupEvent('fate-cloud-ready', null, isElectronShell() ? 32000 : 9000);
    }
    status.cloudReady = !!window._fateCloudReady || !(authState && authState.user);
    const profileStarted = performance.now();
    while(performance.now() - profileStarted < (isElectronShell() ? 12000 : 3000)){
      profileState = readProfileReadiness();
      status.profilePresets = profileState.presets;
      status.profileOwned = profileState.owned;
      status.profileStarterChosen = profileState.starterChosen;
      if(status.authReady && (!(authState && authState.user) || status.cloudReady)) {
        status.profileReady = true;
        break;
      }
      if(profileState.ready) {
        status.profileReady = true;
        break;
      }
      updateInitialLoadingStage('Syncing Profile', 'Waiting for collection and deck state.');
      await waitStartupMs(250);
      authState = window.FATE_ONLINE || authState;
      status.authReady = !!(authState && authState.ready);
      status.cloudReady = !!window._fateCloudReady || !(authState && authState.user);
    }
    status.profileReady = !!status.profileReady;
    status.ms = Math.round(performance.now() - started);
    perf.startupProfileWarmup = status;
    return status;
  }

  async function runStartupLoadingSequence(){
    if(window.__fateStartupLoadingSequenceStarted) return;
    window.__fateStartupLoadingSequenceStarted = true;
    window.__fateStartupLoadingManaged = true;
    startupWarmupEpoch += 1;
    const sequenceEpoch = startupWarmupEpoch;
    window.__fateStartupWarmupCancelled = false;
    try{ if(window.__fateStartupLoadingFallback) clearTimeout(window.__fateStartupLoadingFallback); }catch(e){}
    const assetTotal = collectInitialAssets().length;
    const menuStepTotal = 11;
    const state = {done:0, total:assetTotal + menuStepTotal, cancelled:false, errors:[]};
    const originalScreen = getActiveScreenId() || 's-title';
    showInitialLoadingScreen(state.total, {
      title:'Loading Menus',
      copy:'Preparing menu assets and templates.'
    });
    const startedAt = performance.now();
    let timeoutId = 0;
    const timeout = new Promise(resolve=>{
      timeoutId = setTimeout(function(){
        state.cancelled = true;
        window.__fateStartupWarmupCancelled = true;
        resolve('timeout');
      }, isElectronShell() ? 60000 : 20000);
    });
    async function runNonVisualPrep(label, copy, task, timeoutMs){
      await runStartupStep(state, label, copy, function(){
        if(typeof task !== 'function') return;
        return Promise.race([
          Promise.resolve().then(task),
          waitStartupMs(timeoutMs || (isElectronShell() ? 8000 : 2500))
        ]);
      });
    }
    const work = (async function(){
      await preloadInitialAssets({
        keepVisible:true,
        shouldCancel:function(){ return state.cancelled || startupWarmupEpoch !== sequenceEpoch || isStartupGameFlowActive(); },
        onProgress:function(done){
          if(state.cancelled || startupWarmupEpoch !== sequenceEpoch || isStartupGameFlowActive()) return;
          state.done = Math.min(assetTotal, done);
          updateInitialLoadingStage('Loading Assets', 'Decoding backgrounds, portraits, and card UI assets.');
          updateInitialLoadingScreen(state.done, state.total, `${state.done} / ${state.total}`);
        }
      });
      state.done = Math.max(state.done, assetTotal);
      await runNonVisualPrep('Preparing Free Play', 'Caching Free Play templates and images.', function(){
        return warmFreePlayMenu();
      });
      await runNonVisualPrep('Preparing Choose Deck', 'Caching deck picker templates and thumbnails.', function(){
        return warmChooseDeckMenu();
      });
      await runNonVisualPrep('Preparing AI Picker', 'Caching opponent templates and portraits.', function(){
        return warmAiPickerMenu();
      });
      await runNonVisualPrep('Preparing Deck Builder', 'Prebuilding title deck builder layout.', function(){
        return warmDeckBuilderMenu();
      });
      await runNonVisualPrep('Syncing Profile', 'Waiting for real collection and deck data before warming Challenger.', function(){
        return waitForProfileDataForMenuWarmup();
      }, isElectronShell() ? 34000 : 14000);
      await runNonVisualPrep('Preparing Challenger Play', 'Prebuilding Challenger play tab.', function(){
        return warmChallengerTab('play');
      });
      await runNonVisualPrep('Preparing Challenger Store', 'Prebuilding Challenger store tab.', function(){
        return warmChallengerTab('store');
      });
      await runNonVisualPrep('Preparing Challenger Collection', 'Prebuilding Challenger collection tab.', function(){
        return warmChallengerTab('collection');
      });
      await runNonVisualPrep('Preparing Challenger Deck Builder', 'Prebuilding Challenger deck builder tab.', function(){
        return warmChallengerTab('deckbuilder');
      });
      await runNonVisualPrep('Finalizing Menus', 'Scheduling remaining menu asset work.', function(){
        if(typeof window.showMissionControl === 'function') {
          try { window.showMissionControl(); } catch(e) {}
        }
        const title = document.getElementById('s-title');
        optimizeImages(title || document);
        scheduleBackgroundMenuPreloads();
        if(typeof warmMissionMenu === 'function') {
          return Promise.resolve(warmMissionMenu()).then(function(){
            cleanupStartupWarmupOverlays();
          });
        }
        cleanupStartupWarmupOverlays();
      });
      return 'complete';
    })();
    const result = await Promise.race([work, timeout]);
    state.cancelled = true;
    window.__fateStartupWarmupCancelled = true;
    clearTimeout(timeoutId);
    const gameFlowActive = isStartupGameFlowActive();
    try{
      cleanupStartupWarmupOverlays();
      if(!gameFlowActive && getActiveScreenId() !== originalScreen && typeof window.showScreen === 'function') window.showScreen(originalScreen && originalScreen !== 's-game' ? originalScreen : 's-title');
    }catch(e){}
    window.__fateMenusWarmed = true;
    try{
      if(typeof window.renderTitleProfile === 'function' && getActiveScreenId() === 's-title') window.renderTitleProfile();
      if(typeof window.onScreenChange === 'function') window.onScreenChange(getActiveScreenId() || 's-title');
    }catch(e){}
    state.done = state.total;
    updateInitialLoadingScreen(state.done, state.total, result === 'timeout' ? 'Ready' : `${state.total} / ${state.total}`);
    hideInitialLoadingScreen();
    const perf = window.__fatePerf = window.__fatePerf || {};
    perf.startupMenuWarmup = {
      result,
      ms:Math.round(performance.now() - startedAt),
      errors:state.errors
    };
    try{
      perf.menuSamples = [];
      perf.renderSamples = [];
      perf.renderBreakdowns = [];
      perf.longTaskSamples = [];
      perf.longTasks = 0;
      perf.slowFrames = 0;
      perf.worstFrameMs = 0;
      if(typeof window.fateStopMenuMinuteLog === 'function') window.fateStopMenuMinuteLog('startup-warmup-complete');
      setTimeout(function(){
        if(getActiveScreenId() !== 's-game' && typeof window.fateStartMenuMinuteLog === 'function') {
          window.fateStartMenuMinuteLog({durationMs:60000});
        }
      }, 120);
    }catch(e){}
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

  function runElectronLightStartup(){
    const perf = window.__fatePerf = window.__fatePerf || {};
    window.__fateStartupLoadingManaged = true;
    window.__fateStartupWarmupCancelled = true;
    window.__fateStartupWarmupActive = false;
    window.__fateMenusWarmed = true;
    try{ if(window.__fateStartupLoadingFallback) clearTimeout(window.__fateStartupLoadingFallback); }catch(e){}
    perf.startupMenuWarmup = {
      result:'skipped-electron-light-start',
      ms:0,
      errors:[]
    };
    perf.startupWarmupPolicy = {
      mode:'electron-light-start',
      fullWarmupOptIn:'localStorage.fateFullStartupWarmup=1'
    };
    recordLifecycleEvent('startup-warmup-skipped', perf.startupWarmupPolicy);
    try{
      updateInitialLoadingStage('Loading Menus', 'Ready.');
      updateInitialLoadingScreen(1, 1, 'Ready');
      hideInitialLoadingScreen();
    }catch(e){}
    setTimeout(function(){
      try{ scheduleBackgroundMenuPreloads(); }catch(e){}
    }, 1200);
    try{
      if(typeof window.fateStopMenuMinuteLog === 'function') window.fateStopMenuMinuteLog('electron-light-start');
      setTimeout(function(){
        if(getActiveScreenId() !== 's-game' && typeof window.fateStartMenuMinuteLog === 'function') {
          window.fateStartMenuMinuteLog({durationMs:60000});
        }
      }, 120);
    }catch(e){}
  }

  function installMatchWarmup(){
    if(window.__fateSmoothStartWarmupInstalled) return;
    window.__fateSmoothStartWarmupInstalled = true;
    const origStart = window.startGame;
    if(typeof origStart === 'function' && !origStart.__fateSmoothWarmWrapped){
      window.startGame = function(){
        cancelStartupWarmup('start-game');
        const entryEpoch = markMatchEntry('start-game');
        const result = origStart.apply(this, arguments);
        if(typeof window.fateWarmMatchAssets === 'function') return result;
        matchWarmupTimers.push(setTimeout(function(){
          if(entryEpoch === matchEntryEpoch) warmGameAssets({light:false, force:true, source:'pre-match-early'});
        }, 120));
        matchWarmupTimers.push(setTimeout(function(){
          if(entryEpoch === matchEntryEpoch) warmGameAssets({light:false, force:true, source:'pre-match-mid'});
        }, 950));
        matchWarmupTimers.push(setTimeout(function(){
          if(entryEpoch === matchEntryEpoch) warmGameAssets({light:true, force:true, source:'pre-match-late'});
        }, 2400));
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
        matchEntry: perf.matchEntry || null,
        matchWarmupSkipped: perf.matchWarmupSkipped || null,
        startupWarmupCancelled: perf.startupWarmupCancelled || null,
        menuScheduler: window.FateMenuScheduler && typeof window.FateMenuScheduler.report === 'function' ? window.FateMenuScheduler.report() : null,
        menuViews: window.FateMenuViews && typeof window.FateMenuViews.report === 'function' ? window.FateMenuViews.report() : null,
          renderRequests: perf.renderRequests || 0,
          broadRenderRequests: perf.broadRenderRequests || 0,
          scopedRenderRequests: perf.scopedRenderRequests || 0,
          pointerDeferredGameRenders: perf.pointerDeferredGameRenders || 0,
          pointerBypassedGameRenderDeferrals: perf.pointerBypassedGameRenderDeferrals || 0,
          lastPointerRenderDecision: perf.lastPointerRenderDecision || null,
          v2BoardActionFastPathRenders: perf.v2BoardActionFastPathRenders || 0,
          lastV2BoardActionFastPath: perf.lastV2BoardActionFastPath || null,
          lastRenderRequestParts: perf.lastRenderRequestParts || '',
          lastBroadRenderParts: perf.lastBroadRenderParts || '',
          lastScopedRenderParts: perf.lastScopedRenderParts || '',
        canvasBoard: typeof window.fateCanvasBoardReport === 'function' ? window.fateCanvasBoardReport() : null,
        actionPresentation: typeof window.fateActionPerfReport === 'function' ? window.fateActionPerfReport() : null,
        vfx: window.FateVfxDirector && typeof window.FateVfxDirector.report === 'function' ? window.FateVfxDirector.report() : null,
        renderV2Flags: window.FateRenderV2Flags && typeof window.FateRenderV2Flags.report === 'function' ? window.FateRenderV2Flags.report() : null,
        matchRenderer: window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.report === 'function' ? window.FateMatchRendererAdapter.report() : null,
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
        matchEntry: perf.matchEntry || null,
        matchWarmup: perf.matchWarmup || null,
        matchWarmupProgress: perf.matchWarmupProgress || null,
        matchWarmupSkipped: perf.matchWarmupSkipped || null,
        startupWarmupCancelled: perf.startupWarmupCancelled || null,
        renderRequests: perf.renderRequests || 0,
          broadRenderRequests: perf.broadRenderRequests || 0,
          scopedRenderRequests: perf.scopedRenderRequests || 0,
          lastRenderRequestParts: perf.lastRenderRequestParts || '',
          lastBroadRenderParts: perf.lastBroadRenderParts || '',
          lastScopedRenderParts: perf.lastScopedRenderParts || '',
          startupMenuWarmup: perf.startupMenuWarmup || null,
          startupProfileWarmup: perf.startupProfileWarmup || null,
          menuScheduler: window.FateMenuScheduler && typeof window.FateMenuScheduler.report === 'function' ? window.FateMenuScheduler.report() : null,
          menuViews: window.FateMenuViews && typeof window.FateMenuViews.report === 'function' ? window.FateMenuViews.report() : null
        },
        canvasBoard: typeof window.fateCanvasBoardReport === 'function' ? window.fateCanvasBoardReport() : null,
        diagnosticsAvailable:{
          actionPresentation:!!window.FateActionPresentation,
          actionPresentationReport:typeof window.fateActionPerfReport === 'function',
          vfxDirector:!!window.FateVfxDirector,
          vfxDirectorReport:!!(window.FateVfxDirector && typeof window.FateVfxDirector.report === 'function'),
          textureCache:!!window.FateCardTextureCache
        },
        actionPresentation: typeof window.fateActionPerfReport === 'function' ? window.fateActionPerfReport() : null,
        vfx: window.FateVfxDirector && typeof window.FateVfxDirector.report === 'function' ? window.FateVfxDirector.report() : null,
        renderV2Flags: window.FateRenderV2Flags && typeof window.FateRenderV2Flags.report === 'function' ? window.FateRenderV2Flags.report() : null,
        matchRenderer: window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.report === 'function' ? window.FateMatchRendererAdapter.report() : null,
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
          matchTraceSummary:summarizeMatchSamples(),
          recentMatchSamples:(perf.matchSamples || []).slice(-20),
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
    function recordMatchSample(sample){
      try{
        const active = getActiveScreenId();
        const inGame = active === 's-game';
        if(!inGame && !(sample && sample.force)) return;
        perf.matchSamples = perf.matchSamples || [];
        const row = Object.assign({
          at:Date.now(),
          startMs:0,
          endMs:0,
          screen:active,
          turn:(typeof G !== 'undefined' && G ? G.turn : null),
          currentPlayer:(typeof G !== 'undefined' && G ? G.currentPlayer : null)
        }, sample || {});
        perf.matchSamples.push(row);
        if(perf.matchSamples.length > 160) perf.matchSamples.splice(0, perf.matchSamples.length - 160);
        const key = row.name || row.kind || 'unknown';
        perf.matchTraceStats = perf.matchTraceStats || {};
        const stat = perf.matchTraceStats[key] || (perf.matchTraceStats[key] = {count:0, totalMs:0, maxMs:0, slow:0, lastMs:0, lastAt:0});
        const ms = Number(row.ms) || 0;
        stat.count += 1;
        stat.totalMs += ms;
        stat.maxMs = Math.max(stat.maxMs || 0, ms);
        stat.lastMs = ms;
        stat.lastAt = row.at || Date.now();
        if(ms >= 34) stat.slow += 1;
      }catch(e){}
    }
    function summarizeMatchSamples(){
      const stats = perf.matchTraceStats || {};
      return Object.entries(stats).map(function(entry){
        const name = entry[0];
        const item = entry[1] || {};
        const count = Number(item.count) || 0;
        return {
          name,
          count,
          avgMs:count ? Math.round((Number(item.totalMs || 0) / count) * 10) / 10 : 0,
          maxMs:Math.round((Number(item.maxMs) || 0) * 10) / 10,
          slow:Number(item.slow) || 0,
          lastMs:Math.round((Number(item.lastMs) || 0) * 10) / 10
        };
      }).sort(function(a, b){ return (b.maxMs || 0) - (a.maxMs || 0) || (b.count || 0) - (a.count || 0); }).slice(0, 20);
    }
    function matchSamplesNearWindow(startMs, durationMs){
      try{
        const start = Number(startMs) || 0;
        const end = start + (Number(durationMs) || 0);
        return (perf.matchSamples || []).filter(function(sample){
          const s = Number(sample.startMs) || 0;
          const e = Number(sample.endMs) || s;
          return e >= start - 8 && s <= end + 8;
        }).slice(-8).map(function(sample){
          return {
            name:sample.name || sample.kind || 'unknown',
            ms:sample.ms || 0,
            startMs:Math.round((Number(sample.startMs) || 0) * 10) / 10,
            endMs:Math.round((Number(sample.endMs) || 0) * 10) / 10,
            label:sample.label || '',
            turn:sample.turn,
            currentPlayer:sample.currentPlayer
          };
        });
      }catch(e){
        return [];
      }
    }
    function lightMatchTraceSnapshot(){
      const active = getActiveScreenId();
      const perfState = window.__fatePerf || {};
      return {
        at:new Date().toISOString(),
        activeScreen:active,
        hidden:document.hidden || !!window.__fatePageHidden,
        gameState:readCompactGameState(),
        perf:{
          longTasks:perfState.longTasks || 0,
          nativeTimerDelayMs:perfState.nativeTimerDelayMs || 0,
          renderRequests:perfState.renderRequests || 0,
          broadRenderRequests:perfState.broadRenderRequests || 0,
          scopedRenderRequests:perfState.scopedRenderRequests || 0,
          lastRenderRequestParts:perfState.lastRenderRequestParts || '',
          matchEntry:perfState.matchEntry || null,
          matchWarmup:perfState.matchWarmup || null,
          matchWarmupProgress:perfState.matchWarmupProgress || null,
          matchTraceSummary:summarizeMatchSamples()
        },
        recentMatchSamples:(perfState.matchSamples || []).slice(-20),
        recentLongTasks:(perfState.longTaskSamples || []).slice(-12),
        actionPresentation:typeof window.fateActionPerfReport === 'function' ? window.fateActionPerfReport() : null,
        vfx:window.FateVfxDirector && typeof window.FateVfxDirector.report === 'function' ? (function(report){
          return report ? {
            active:report.active || null,
            performance:report.performance || null,
            eventBridge:report.eventBridge || null
          } : null;
        })(window.FateVfxDirector.report()) : null,
        matchRenderer:window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.report === 'function' ? (function(report){
          return report ? {
            draws:report.draws,
            dirtyDraws:report.dirtyDraws,
            fullSceneRedraws:report.fullSceneRedraws,
            cardLayerOnlyDraws:report.cardLayerOnlyDraws,
            vfxOnlyDraws:report.vfxOnlyDraws,
            lastMs:report.lastMs,
            avgMs:report.avgMs,
            maxMs:report.maxMs,
            source:report.source,
            lastDirtySource:report.lastDirtySource
          } : null;
        })(window.FateMatchRendererAdapter.report()) : null,
        diagnosticsMode:'match-light'
      };
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
    let activeMatchMinuteLog = null;
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
    function readCompactGameState(){
      try{
        const g = (typeof G !== 'undefined' && G) ? G : (window.G || null);
        if(!g) return null;
        return {
          phase:g.phase || '',
          turn:Number(g.turn) || 0,
          currentPlayer:typeof g.currentPlayer === 'number' ? g.currentPlayer : null,
          aiPlayer:typeof g.aiPlayer === 'number' ? g.aiPlayer : null,
          isOnline:!!g._onlineRoomCode,
          isSpectator:!!g._isSpectator,
          boardCards:g.board ? g.board.reduce(function(n, z){
            return n + (Array.isArray(z) ? z.reduce(function(m, r){
              return m + (Array.isArray(r) ? r.filter(Boolean).length : 0);
            }, 0) : 0);
          }, 0) : 0,
          p1Hand:g.players && g.players[0] && Array.isArray(g.players[0].hand) ? g.players[0].hand.length : 0,
          p2Hand:g.players && g.players[1] && Array.isArray(g.players[1].hand) ? g.players[1].hand.length : 0,
          p1Deck:g.players && g.players[0] && Array.isArray(g.players[0].deck) ? g.players[0].deck.length : 0,
          p2Deck:g.players && g.players[1] && Array.isArray(g.players[1].deck) ? g.players[1].deck.length : 0
        };
      }catch(e){
        return null;
      }
    }
    function makeMinuteSessionId(kind){
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      let mode = getActiveScreenId() || 'menu';
      try{
        if(typeof CURRENT_MODE !== 'undefined' && CURRENT_MODE) mode = String(CURRENT_MODE).slice(0, 18);
      }catch(e){}
      return (kind === 'match' ? 'match-' : '') + stamp + '-' + mode;
    }
    function compactMinuteSnapshot(snapshot){
      if(!snapshot) return null;
      return {
        loggerVersion:3,
        at:snapshot.at,
        activeScreen:snapshot.activeScreen,
        hidden:snapshot.hidden,
        gameState:snapshot.gameState || readCompactGameState(),
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
        diagnosticsAvailable:snapshot.diagnosticsAvailable,
        actionPresentation:snapshot.actionPresentation,
        vfx:snapshot.vfx,
        renderV2Flags:snapshot.renderV2Flags,
        matchRenderer:snapshot.matchRenderer,
        renderSnapshot:snapshot.renderSnapshot,
        matchLayout:snapshot.matchLayout
      };
    }
    function readFrameGapContext(gapMs, now, isMatch){
      const perfState = window.__fatePerf || {};
      const richContext = Number(gapMs) >= 100;
      let action = null;
      try{
        if(typeof window.fateActionPerfReport === 'function') {
          const report = window.fateActionPerfReport();
          action = {
            active:report && report.active || null,
            recent:report && report.recent && report.recent[0] || null
          };
        }
      }catch(e){}
      let vfx = null;
      try{
        if(richContext && window.FateVfxDirector && typeof window.FateVfxDirector.report === 'function') {
          const report = window.FateVfxDirector.report();
          vfx = report ? {
            active:report.active || null,
            performance:report.performance ? {
              lastVfxMs:report.performance.lastVfxMs,
              avgVfxMs:report.performance.avgVfxMs,
              maxVfxMs:report.performance.maxVfxMs,
              draws:report.performance.draws
            } : null
          } : null;
        }
      }catch(e){}
      let matchRenderer = null;
      try{
        if(richContext && window.FateMatchRendererAdapter && typeof window.FateMatchRendererAdapter.report === 'function') {
          const report = window.FateMatchRendererAdapter.report();
          matchRenderer = report ? {
            source:report.source || '',
            lastMs:report.lastMs,
            avgMs:report.avgMs,
            maxMs:report.maxMs,
            lastDirtyMask:report.lastDirtyMask,
            lastDirtySource:report.lastDirtySource,
            fullSceneRedraws:report.fullSceneRedraws,
            dirtyDraws:report.dirtyDraws,
            vfxOnlyDraws:report.vfxOnlyDraws,
            zoneScrollOnlyDraws:report.zoneScrollOnlyDraws
          } : null;
        }
      }catch(e){}
      let animationCount = 0;
      if(richContext) try{ animationCount = document.getAnimations ? document.getAnimations().length : 0; }catch(e){}
      const entry = perfState.matchEntry || null;
      const entryAgeMs = entry && entry.at ? Math.max(0, now - entry.at) : null;
      return {
        gapMs,
        atMs:Math.round(now),
        kind:isMatch ? 'match-frame-gap' : 'menu-frame-gap',
        phase:isMatch && entryAgeMs !== null ? (entryAgeMs < 3200 ? 'match-entry' : (entryAgeMs < 10000 ? 'early-match' : 'steady')) : 'steady',
        entryAgeMs:entryAgeMs === null ? null : Math.round(entryAgeMs),
        screen:getActiveScreenId(),
        hidden:!!document.hidden,
        hasFocus:document.hasFocus ? !!document.hasFocus() : null,
        visibilityState:document.visibilityState || '',
        nativeTimerDelayMs:Math.round((Number(perfState.nativeTimerDelayMs) || 0) * 10) / 10,
        longTasks:Number(perfState.longTasks) || 0,
          recentLongTasks:(perfState.longTaskSamples || []).slice(-4),
          recentMatchSamples:(perfState.matchSamples || []).slice(-8),
          matchTraceSummary:summarizeMatchSamples(),
        renderRequests:Number(perfState.renderRequests) || 0,
        broadRenderRequests:Number(perfState.broadRenderRequests) || 0,
        scopedRenderRequests:Number(perfState.scopedRenderRequests) || 0,
        lastRenderRequestParts:perfState.lastRenderRequestParts || '',
        animationCount,
        action,
        vfx,
        matchRenderer,
        gameState:readCompactGameState(),
        likelyExternalPause:gapMs > 500 && (!perfState.longTaskSamples || !perfState.longTaskSamples.length || (perfState.longTaskSamples.slice(-1)[0].start + perfState.longTaskSamples.slice(-1)[0].duration < now - gapMs))
      };
    }
    function stopMinuteLog(kind, reason){
      const isMatch = kind === 'match';
      const state = isMatch ? activeMatchMinuteLog : activeMenuMinuteLog;
      if(!state || state.stopped) return state || null;
      state.stopped = true;
      if(isMatch) activeMatchMinuteLog = null;
      else activeMenuMinuteLog = null;
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
        finalScreen:getActiveScreenId(),
        logKind:state.kind || kind || 'menu'
      };
      if(api && typeof api.finishUiMinuteLog === 'function') api.finishUiMinuteLog(payload).catch(function(){});
      return Object.assign({ok:true}, payload, {paths:state.paths || null});
    }
    function stopMenuMinuteLog(reason){
      return stopMinuteLog('menu', reason);
    }
    function stopMatchMinuteLog(reason){
      return stopMinuteLog('match', reason);
    }
    function startMinuteLog(kind, reason, options){
      const api = getElectronDiagnosticsApi();
      if(!api) return {ok:false, reason:'electron-diagnostics-unavailable'};
      const isMatch = kind === 'match';
      const current = isMatch ? activeMatchMinuteLog : activeMenuMinuteLog;
      if(current && !current.stopped) return {ok:true, alreadyRunning:true, sessionId:current.sessionId, paths:current.paths || null};
      if(!isMatch && gameScreenActive()) return {ok:false, reason:'game-screen-active'};
      if(isMatch && !gameScreenActive()) return {ok:false, reason:'game-screen-not-active'};
      const opts = options || {};
      const untilEndScreen = !!(isMatch && opts.untilEndScreen);
      const requestedDurationMs = Number(opts.durationMs) || (untilEndScreen ? 3600000 : 60000);
      const durationMs = isMatch
        ? Math.max(5000, Math.min(3600000, requestedDurationMs))
        : Math.max(5000, Math.min(120000, requestedDurationMs));
      const intervalMs = Math.max(500, Math.min(5000, Number(opts.intervalMs) || 1000));
      const endScreenTailMs = untilEndScreen ? Math.max(1000, Math.min(30000, Number(opts.endScreenTailMs) || 10000)) : 0;
      const leftMatchTailMs = untilEndScreen ? Math.max(1000, Math.min(30000, Number(opts.leftMatchTailMs) || 5000)) : 0;
      const state = {
        kind:isMatch ? 'match' : 'menu',
        sessionId:makeMinuteSessionId(isMatch ? 'match' : 'menu'),
        startedAt:performance.now(),
        startedIso:new Date().toISOString(),
        untilEndScreen,
        endScreenTailMs,
        leftMatchTailMs,
        endScreenFirstSeenAt:0,
        nonMatchScreenFirstSeenAt:0,
        sampleCount:0,
        stopped:false,
        paths:null,
        lastFrameAt:performance.now(),
        intervalFrames:0,
        intervalMaxGap:0,
        intervalSlowGaps:[],
        intervalSlowGapDetails:[],
        sampleBusy:false,
        lightMatchLogging:isMatch && opts.deepSnapshots !== true,
        deepEvery:isMatch ? Math.max(0, Math.min(60, Number(opts.deepEvery) || 0)) : 1,
        timer:0,
        frameRaf:0
      };
      if(isMatch) activeMatchMinuteLog = state;
      else activeMenuMinuteLog = state;
      function frame(now){
        if(state.stopped) return;
        const gap = now - state.lastFrameAt;
        state.lastFrameAt = now;
        state.intervalFrames += 1;
        if(gap > state.intervalMaxGap) state.intervalMaxGap = gap;
        if(gap > 34) {
          const roundedGap = Math.round(gap * 10) / 10;
          state.intervalSlowGaps.push(roundedGap);
          if(state.intervalSlowGaps.length > 20) state.intervalSlowGaps.shift();
          if(gap > 50 || state.intervalSlowGapDetails.length < 3) {
            try{
              state.intervalSlowGapDetails.push(readFrameGapContext(roundedGap, now, isMatch));
              if(state.intervalSlowGapDetails.length > 8) state.intervalSlowGapDetails.shift();
            }catch(e){}
          }
        }
        state.frameRaf = requestAnimationFrame(frame);
      }
      state.frameRaf = requestAnimationFrame(frame);
      function readFrameInterval(){
        const elapsed = Math.max(1, performance.now() - (state.lastSampleAt || state.startedAt));
        const entry = window.__fatePerf && window.__fatePerf.matchEntry || null;
        const now = performance.now();
        const entryAgeMs = entry && entry.at ? Math.max(0, now - entry.at) : null;
        const phase = isMatch && entryAgeMs !== null
          ? (entryAgeMs < 3200 ? 'match-entry' : (entryAgeMs < 10000 ? 'early-match' : 'steady'))
          : 'steady';
        const item = {
          frames:state.intervalFrames,
          fps:Math.round(state.intervalFrames * 1000 / elapsed),
          maxFrameGapMs:Math.round(state.intervalMaxGap * 10) / 10,
          slowFrameGaps:state.intervalSlowGaps.slice(-20),
          slowFrameDetails:state.intervalSlowGapDetails.slice(-12),
          phase,
          entryAgeMs:entryAgeMs === null ? null : Math.round(entryAgeMs)
        };
        state.intervalFrames = 0;
        state.intervalMaxGap = 0;
        state.intervalSlowGaps = [];
        state.intervalSlowGapDetails = [];
        state.lastSampleAt = performance.now();
        return item;
      }
      async function writeSample(kind){
        if(state.stopped || state.sampleBusy) return;
        state.sampleBusy = true;
        try{
          const deepSnapshot = !isMatch || !state.lightMatchLogging || (state.deepEvery > 0 && state.sampleCount > 0 && state.sampleCount % state.deepEvery === 0);
          if(deepSnapshot) await readElectronPerformanceInfo();
          const elapsedMs = Math.round(performance.now() - state.startedAt);
          const payload = {
            type:kind || 'sample',
            at:new Date().toISOString(),
            sessionId:state.sessionId,
            sampleIndex:state.sampleCount,
            elapsedMs,
            frameInterval:readFrameInterval(),
            logKind:state.kind,
            snapshot:deepSnapshot ? compactMinuteSnapshot(getLagTraceSnapshot()) : lightMatchTraceSnapshot()
          };
          if(state.lightMatchLogging) payload.diagnosticsMode = deepSnapshot ? 'match-deep' : 'match-light';
          state.sampleCount += 1;
          await api.appendUiMinuteLog(payload);
          const activeScreen = getActiveScreenId();
          if(!isMatch && gameScreenActive()) {
            stopMenuMinuteLog('entered-game-screen');
          } else if(isMatch && untilEndScreen) {
            const sampleNow = performance.now();
            if(activeScreen === 's-win') {
              if(!state.endScreenFirstSeenAt) state.endScreenFirstSeenAt = sampleNow;
              state.nonMatchScreenFirstSeenAt = 0;
              if(sampleNow - state.endScreenFirstSeenAt >= endScreenTailMs) stopMatchMinuteLog('end-screen-tail-complete');
            } else if(activeScreen !== 's-game') {
              if(!state.nonMatchScreenFirstSeenAt) state.nonMatchScreenFirstSeenAt = sampleNow;
              state.endScreenFirstSeenAt = 0;
              if(sampleNow - state.nonMatchScreenFirstSeenAt >= leftMatchTailMs) stopMatchMinuteLog('left-match-screen-before-end');
            } else {
              state.endScreenFirstSeenAt = 0;
              state.nonMatchScreenFirstSeenAt = 0;
            }
            if(!state.stopped && elapsedMs >= durationMs) stopMatchMinuteLog('duration-hard-cap-before-end-screen');
          } else if(isMatch && !gameScreenActive()) {
            stopMatchMinuteLog('left-game-screen');
          } else if(elapsedMs >= durationMs) {
            stopMinuteLog(state.kind, 'duration-complete');
          }
        }catch(e){
          state.lastError = String(e && e.message || e);
        }finally{
          state.sampleBusy = false;
        }
      }
      const meta = {
        sessionId:state.sessionId,
        reason:reason || 'main-menu-diagnostics',
        logKind:state.kind,
        loggerVersion:3,
        startedAt:state.startedIso,
        durationMs,
        intervalMs,
        untilEndScreen,
        endScreenTailMs,
        leftMatchTailMs,
        location:String(location.href || ''),
        userAgent:navigator.userAgent || '',
        screen:getActiveScreenId(),
        isElectron:isElectronShell()
      };
      api.startUiMinuteLog(meta).then(function(res){
        state.paths = res && res.paths || null;
        if(isMatch) window.__fateLatestMatchMinuteLogPath = state.paths && state.paths.latest || null;
        else window.__fateLatestMenuMinuteLogPath = state.paths && state.paths.latest || null;
        writeSample('initial-sample');
      }, function(err){
        state.lastError = String(err && err.message || err);
      });
      state.timer = setInterval(function(){ writeSample('sample'); }, intervalMs);
      return {ok:true, sessionId:state.sessionId, paths:state.paths || null};
    }
    function startMenuMinuteLog(reason, options){
      return startMinuteLog('menu', reason, options);
    }
    function startMatchMinuteLog(reason, options){
      return startMinuteLog('match', reason || 'match-start', options);
    }
    function installMenuMinuteLogger(){
      if(window.__fateMenuMinuteLoggerInstalled) return;
      window.__fateMenuMinuteLoggerInstalled = true;
      window.fateStartMenuMinuteLog = function(options){ return startMenuMinuteLog('manual', options); };
      window.fateStopMenuMinuteLog = function(reason){ return stopMenuMinuteLog(reason || 'manual'); };
      window.fateStartMatchMinuteLog = function(options){ return startMatchMinuteLog('manual-match', options); };
      window.fateStopMatchMinuteLog = function(reason){ return stopMatchMinuteLog(reason || 'manual'); };
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
      window.fateMatchMinuteLogStatus = function(){
        const state = activeMatchMinuteLog;
        return state ? {
          running:!state.stopped,
          sessionId:state.sessionId,
          elapsedMs:Math.round(performance.now() - state.startedAt),
          samples:state.sampleCount || 0,
          paths:state.paths || null,
          latestPath:window.__fateLatestMatchMinuteLogPath || null,
          untilEndScreen:!!state.untilEndScreen,
          endScreenTailMs:state.endScreenTailMs || 0,
          endScreenSeen:!!state.endScreenFirstSeenAt,
          lastError:state.lastError || ''
        } : {running:false, latestPath:window.__fateLatestMatchMinuteLogPath || null};
      };
      window.addEventListener('fate-screen-changed', function(ev){
        const to = ev && ev.detail && ev.detail.to || getActiveScreenId();
        if(to === 's-game') {
          if(activeMenuMinuteLog && !activeMenuMinuteLog.stopped) stopMenuMinuteLog('entered-game-screen');
          startMatchMinuteLog('entered-game-screen', {durationMs:3600000, intervalMs:2000, untilEndScreen:true, endScreenTailMs:10000, leftMatchTailMs:5000});
        } else {
          if(activeMatchMinuteLog && !activeMatchMinuteLog.stopped) {
            if(activeMatchMinuteLog.untilEndScreen && to === 's-win') {
              activeMatchMinuteLog.endScreenFirstSeenAt = activeMatchMinuteLog.endScreenFirstSeenAt || performance.now();
            } else {
              stopMatchMinuteLog('screen-changed-to-' + to);
            }
          }
          if(!activeMatchMinuteLog || activeMatchMinuteLog.stopped) startMenuMinuteLog('screen-changed-to-' + to);
        }
      });
      if(!gameScreenActive()) startMenuMinuteLog('startup-menu');
    }
    installMenuMinuteLogger();
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
              name: entry.name || 'longtask',
              matchSamples: matchSamplesNearWindow(entry.startTime, entry.duration)
            });
          });
          if(perf.longTaskSamples.length > 40) perf.longTaskSamples.splice(0, perf.longTaskSamples.length - 40);
        });
        observer.observe({entryTypes:['longtask']});
        window.fateLongTaskSnapshot = function(){
          return {
            count:Number(perf.longTasks) || 0,
            recent:(perf.longTaskSamples || []).slice(-12)
          };
        };
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
        try{
          const result = fn.apply(this, arguments);
          if(result && typeof result.then === 'function' && opts && opts.async){
            const label = summarizeArgs(arguments);
            result.then(function(){
              recordMatchSample({
                kind:'async-complete',
                name,
                ms:Math.round((performance.now() - t0) * 10) / 10,
                startMs:t0,
                endMs:performance.now(),
                label
              });
            }, function(){
              recordMatchSample({
                kind:'async-error',
                name,
                ms:Math.round((performance.now() - t0) * 10) / 10,
                startMs:t0,
                endMs:performance.now(),
                label
              });
            });
          }
          return result;
        }
        finally{
          const ms = performance.now() - t0;
          const rounded = Math.round(ms * 10) / 10;
          if(ms > (opts && opts.matchThresholdMs !== undefined ? opts.matchThresholdMs : 8) && (opts && opts.match || getActiveScreenId() === 's-game')){
            recordMatchSample({
              kind:'function',
              name,
              ms:rounded,
              startMs:t0,
              endMs:t0 + ms,
              label:summarizeArgs(arguments)
            });
          }
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
      'startGame','drawCard','addCardToHand',
      'placeSelected','finalizeConsolidate','commitNormalSetAfterPresentation','commitConsolidationAfterPresentation',
      'renderBoardActionForPlayer','renderGame','renderGameImmediate','renderGameParts','renderPiles',
      'renderLandscapePanel','updateTopBar','updateActiveEffectsPanel','refreshBlockOverlays',
      'applyContinuousEffects','highlightValidCells','getValidPlacementOptionsForCard','checkReactions','checkWin',
      'activateBoardCard','renderEffectResolutionForPlayer','getZoneScore','getBaseZoneScore',
      'runAITurn','aiGenerateAllMoves','aiChooseMoveWithMCTS','aiRunRootMCTS','aiEvaluateMove',
      'aiSimulateOutcome','aiDeepEval','aiDoPlace','aiDoConsolidate','aiActivateEffects'
    ].forEach(function(name){ wrapPerfFunction(name, {render:false, match:true, async:/^(runAITurn|aiChooseMoveWithMCTS|aiRunRootMCTS|aiDoPlace|aiDoConsolidate|aiActivateEffects|drawCard)$/.test(name), matchThresholdMs:4}); });
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
    installMatchWarmup();
    installStartupWarmupOverlayGuard();
    runStartupLoadingSequence();
    const timer = window.__fateNativeSetTimeout || window.setTimeout;
    if(electronShell) timer(warmTitleOpenAssets, 1200);
    else warmTitleOpenAssets();
    scheduleBackgroundInitialPreload();
    if(!electronShell) idle(warmGameAssets);
  }

    window.fatePreloadInitialAssets = preloadInitialAssets;
  window.fateWarmMatchAssets = warmMatchAssetsNow;
  window.fateWarmProfileDependentMenus = async function(){
    const originalScreen = getActiveScreenId() || 's-title';
    if(originalScreen === 's-game' || originalScreen === 's-coin' || originalScreen === 's-matchmaking') return false;
    if(window.__fateProfileMenuWarmupRunning) return false;
    window.__fateProfileMenuWarmupRunning = true;
    try{
      await waitForProfileDataForMenuWarmup();
      await warmChallengerTab('play');
      await warmChallengerTab('store');
      await warmChallengerTab('collection');
      await warmChallengerTab('deckbuilder');
      if(typeof window.showScreen === 'function' && getActiveScreenId() !== originalScreen) {
        window.showScreen(originalScreen && originalScreen !== 's-game' ? originalScreen : 's-title');
      }
      return true;
    }catch(e){
      return false;
    }finally{
      window.__fateProfileMenuWarmupRunning = false;
    }
  };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
