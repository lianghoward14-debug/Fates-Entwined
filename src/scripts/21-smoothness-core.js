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
  const lifecycleEvents = [];
  let browserThrottleProbeTimer = 0;
  let browserThrottleProbeRunning = false;
  let lastBrowserThrottleNoticeAt = 0;

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
    let notice = document.getElementById('fate-browser-throttle-notice');
    if(!notice){
      notice = document.createElement('div');
      notice.id = 'fate-browser-throttle-notice';
      notice.style.cssText = 'position:fixed;left:18px;right:18px;bottom:18px;z-index:2147483647;max-width:680px;margin:0 auto;padding:12px 14px;background:rgba(8,9,15,.96);border:2px solid rgba(215,181,90,.86);box-shadow:0 14px 34px rgba(0,0,0,.62);color:#f7e9ba;font:14px system-ui;border-radius:8px;display:flex;align-items:center;gap:12px;';
      document.body && document.body.appendChild(notice);
    }
    const fps = result && result.fps ? result.fps : '?';
    const autoReload = (function(){ try{ return localStorage.getItem('fateAutoReloadRenderThrottle') === '1'; }catch(e){ return false; } })();
    notice.innerHTML = '<div style="flex:1;line-height:1.35;"><b>Browser render throttle detected</b><br><span style="opacity:.88;">The browser renderer is capped around ' + fps + ' FPS. The proven recovery is a clean refresh; compositor resets do not fix this state.</span></div><button id="fate-browser-throttle-reload" style="cursor:pointer;border:0;border-radius:6px;background:#d7b55a;color:#08090f;font-weight:800;padding:9px 12px;">Reload now</button><button id="fate-browser-throttle-auto" style="cursor:pointer;border:1px solid rgba(215,181,90,.65);border-radius:6px;background:rgba(215,181,90,.12);color:#f7e9ba;padding:8px 10px;">' + (autoReload ? 'Auto reload: on' : 'Auto reload: off') + '</button><button id="fate-browser-throttle-dismiss" style="cursor:pointer;border:1px solid rgba(215,181,90,.5);border-radius:6px;background:transparent;color:#f7e9ba;padding:8px 10px;">Dismiss</button>';
    const reload = notice.querySelector('#fate-browser-throttle-reload');
    const auto = notice.querySelector('#fate-browser-throttle-auto');
    const dismiss = notice.querySelector('#fate-browser-throttle-dismiss');
    if(reload) reload.onclick = reloadForBrowserThrottle;
    if(auto) auto.onclick = function(){
      try{
        const next = localStorage.getItem('fateAutoReloadRenderThrottle') !== '1';
        localStorage.setItem('fateAutoReloadRenderThrottle', next ? '1' : '0');
        auto.textContent = next ? 'Auto reload: on' : 'Auto reload: off';
        if(typeof toast === 'function') toast(next ? 'Auto reload enabled for browser render throttle.' : 'Auto reload disabled.');
      }catch(e){}
    };
    if(dismiss) dismiss.onclick = function(){ notice.remove(); };
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
        const noHeavyGameRender = !(perf.renderSamples && perf.renderSamples.length);
        if(result.fps > 0 && result.fps <= 24 && result.maxGapMs >= 45 && noHeavyGameRender && !document.hidden && (!document.hasFocus || document.hasFocus())){
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
    try{
      const cardList = (typeof CARDS !== 'undefined' && Array.isArray(CARDS)) ? CARDS : (Array.isArray(window.CARDS) ? window.CARDS : []);
      if(cardList.length){
        cardList.forEach(function(card){
          if(!card || !card.img) return;
          const src = typeof window.getRuntimeCardImageSrc === 'function' ? window.getRuntimeCardImageSrc(card.img, 'thumb') : card.img;
          assets.add(src);
        });
      }
    }catch(e){}
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

  function preloadImage(src){
    return new Promise(resolve=>{
      const img = new Image();
      let done = false;
      const finish = ()=>{
        if(done) return;
        done = true;
        resolve(src);
      };
      const timer = setTimeout(finish, 3500);
      img.onload = ()=>{ clearTimeout(timer); finish(); };
      img.onerror = ()=>{ clearTimeout(timer); finish(); };
      try{ img.decoding = 'async'; }catch(e){}
      img.src = src;
      if(typeof img.decode === 'function') img.decode().then(()=>{ clearTimeout(timer); finish(); }).catch(()=>{});
    });
  }

  function preloadInitialAssets(){
    if(window.__fateInitialAssetsPreloaded) return Promise.resolve();
    window.__fateInitialAssetsPreloaded = true;
    const assets = collectInitialAssets();
    const total = assets.length;
    let done = 0;
    showInitialLoadingScreen(total);
    updateInitialLoadingScreen(done, total);
    const startedAt = performance.now();
    const workers = Array.from({length:Math.min(10, total)}, async function(){
      while(assets.length){
        const src = assets.shift();
        await preloadImage(src);
        warmCache.add(src);
        done += 1;
        updateInitialLoadingScreen(done, total);
      }
    });
    const minTime = new Promise(resolve=>setTimeout(resolve, 650));
    const hardStop = new Promise(resolve=>setTimeout(resolve, 9000));
    return Promise.race([Promise.all(workers), hardStop])
      .then(()=>minTime)
      .then(()=>{
        if(performance.now() - startedAt > 150) updateInitialLoadingScreen(total, total);
        hideInitialLoadingScreen();
      });
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
        recentRenderSamples: (perf.renderSamples || []).slice(-10),
        recentRenderBreakdowns: (perf.renderBreakdowns || []).slice(-10),
        fpsHistory: (perf.fpsHistory || []).slice(-30)
      };
      if(console && console.table && snapshot.fpsHistory.length) console.table(snapshot.fpsHistory.slice(-12));
      console.log('[Fate FPS] report', snapshot);
      return snapshot;
    };
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
          lastSuppressedGameRender: perf.lastSuppressedGameRender || null
        },
        selectorCounts,
        animationCount,
        heap,
        renderSummary,
        recentRenderSamples: renderSamples.slice(-12),
        recentRenderBreakdowns: renderBreakdowns.slice(-8),
        renderCallers,
        recentLongTasks: (perf.longTaskSamples || []).slice(-12),
        lifecycleEvents: (perf.lifecycleEvents || lifecycleEvents || []).slice(-20),
        browserRenderThrottleLastProbe: perf.browserRenderThrottleLastProbe || null,
        browserRenderThrottleLast: perf.browserRenderThrottleLast || null,
        fpsHistory: (perf.fpsHistory || []).slice(-20)
      };
    }
    window.fateTraceLag = function(seconds){
      const durationMs = Math.max(2000, Math.min(20000, Math.round((Number(seconds) || 8) * 1000)));
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
          const text = JSON.stringify(trace, null, 2);
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
    ['performGameRender','renderBoard','renderHand','renderOppHand','showModal'].forEach(function(name){
      const fn = window[name];
      if(typeof fn !== 'function' || fn.__fatePerfWrapped) return;
      window[name] = function(){
        const t0 = performance.now();
        try{ return fn.apply(this, arguments); }
        finally{
          const ms = performance.now() - t0;
          if(ms > 12){
            if(!Array.isArray(perf.renderSamples)) perf.renderSamples = [];
            perf.renderSamples.push({
              name,
              ms:Math.round(ms * 10) / 10,
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
    });
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
    document.documentElement.classList.add('fate-smooth-runtime');
    document.body && document.body.classList.add('fate-smooth-runtime');
    installVisibleTimerBridge();
    try{
      const perf = window.__fatePerf = window.__fatePerf || {};
      perf.rafMonitorEnabled = false;
      if(localStorage.getItem('fateRafMonitorEnabled') === '1') installRafMonitor();
    }catch(e){}
    optimizeImages(document);
    installObserver();
    installFrameDiagnostics();
    installVisibilityRecovery();
    installMatchWarmup();
    preloadInitialAssets();
    warmGameAssets();
  }

  window.fatePreloadInitialAssets = preloadInitialAssets;

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
