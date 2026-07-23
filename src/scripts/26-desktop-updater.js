(function(){
  'use strict';

  const updater = window.FateDesktopUpdater;
  const STARTUP_CHECK_TIMEOUT_MS = 7000;
  let state = null;
  let banner = null;
  let bannerKicker = null;
  let bannerTitle = null;
  let bannerPercent = null;
  let bannerProgress = null;
  let bannerWarning = null;
  let bannerAction = null;
  let startupCheckStarted = false;
  let startupCheckSettled = false;
  let resolveStartupCheck = null;
  let activeCheckPromise = null;
  let installAttempted = false;
  let installWatchdog = null;

  window.__fateDesktopUpdateCheckPromise = new Promise(resolve => {
    resolveStartupCheck = resolve;
  });

  function isTitleScreenActive(){
    const title = document.getElementById('s-title');
    return !!(title && title.classList.contains('active'));
  }

  function updatePercent(nextState){
    if(String(nextState?.status || '').toLowerCase() === 'ready') return 100;
    const percent = Number(nextState?.percent);
    return Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.round(percent))) : 0;
  }

  function normalizedState(nextState){
    return Object.assign({supported:!!updater, status:updater ? 'idle' : 'disabled'}, nextState || {});
  }

  function renderCurrentVersion(nextState){
    const version = String(nextState?.currentVersion || '').trim();
    const label = document.getElementById('game-version');
    if(label && version) label.textContent = `Version ${version}`;
  }

  function describeStatus(nextState){
    const s = normalizedState(nextState);
    if(!s.supported) {
      return {
        title:'Loading Menus',
        copy:'Desktop updates are unavailable for this build.'
      };
    }
    if(s.status === 'checking') {
      return {
        title:'Checking for Updates',
        copy:'Verifying your desktop build before loading menu assets.'
      };
    }
    if(s.status === 'downloading') {
      return {
        title:'Downloading Update',
        copy:'A newer build was found. It will continue downloading in the background.'
      };
    }
    if(s.status === 'ready') {
      return {
        title:'Update Ready',
        copy:'A verified update is ready. You can install it after startup.'
      };
    }
    if(s.status === 'installing') {
      return {
        title:'Installing Update',
        copy:'Closing the game and starting the verified Windows installer.'
      };
    }
    if(s.status === 'error') {
      return {
        title:'Checking for Updates',
        copy:'The update service did not respond. Continuing safely.'
      };
    }
    return {
      title:'Checking for Updates',
      copy:'Your desktop build is ready.'
    };
  }

  function emitUpdateStatus(nextState, extra){
    const detail = Object.assign({}, normalizedState(nextState), describeStatus(nextState), extra || {});
    try{ window.dispatchEvent(new CustomEvent('fate-desktop-update-status', {detail})); }catch(err){}
  }

  function settleStartupCheck(nextState){
    if(startupCheckSettled) return;
    startupCheckSettled = true;
    if(nextState) state = normalizedState(nextState);
    renderCurrentVersion(state);
    emitUpdateStatus(state, {startupDone:true});
    if(resolveStartupCheck) resolveStartupCheck(state || normalizedState(null));
    renderBanner();
  }

  function stateEndsStartupWait(nextState){
    const status = String(nextState?.status || '').toLowerCase();
    return !nextState?.supported || status === 'idle' || status === 'ready' || status === 'error' || status === 'disabled';
  }

  async function requestUpdateCheck(options){
    const opts = options || {};
    if(!updater) {
      settleStartupCheck({supported:false, status:'disabled'});
      return state || normalizedState(null);
    }
    if(opts.startup && startupCheckStarted) {
      return window.__fateDesktopUpdateCheckPromise;
    }
    if(activeCheckPromise) return activeCheckPromise;
    if(opts.startup) startupCheckStarted = true;

    state = normalizedState(Object.assign({}, state || {}, {supported:true, status:'checking'}));
    emitUpdateStatus(state, {startup:!!opts.startup});
    renderBanner();

    activeCheckPromise = Promise.resolve()
      .then(() => updater.check())
      .then(nextState => {
        state = normalizedState(nextState);
        renderCurrentVersion(state);
        emitUpdateStatus(state, {startup:!!opts.startup});
        renderBanner();
        if(opts.startup && stateEndsStartupWait(state)) settleStartupCheck(state);
        return state;
      })
      .catch(err => {
        state = normalizedState(Object.assign({}, state || {}, {
          supported:true,
          status:'error',
          error:String(err && err.message || err || 'Update check failed')
        }));
        emitUpdateStatus(state, {startup:!!opts.startup});
        renderBanner();
        if(opts.startup) settleStartupCheck(state);
        return state;
      })
      .finally(() => {
        activeCheckPromise = null;
      });

    if(opts.startup) {
      const timeoutMs = Math.max(1000, Number(opts.timeoutMs) || STARTUP_CHECK_TIMEOUT_MS);
      Promise.race([
        activeCheckPromise,
        new Promise(resolve => setTimeout(() => resolve({__timeout:true}), timeoutMs))
      ]).then(result => {
        if(result && result.__timeout) {
          emitUpdateStatus(state || {supported:true, status:'checking'}, {
            startup:true,
            startupDone:true,
            title:'Checking for Updates',
            copy:'The update service is still responding. Continuing startup.'
          });
          settleStartupCheck(state || {supported:true, status:'checking', timeout:true});
        }
      }).catch(() => settleStartupCheck(state || {supported:true, status:'error'}));
      return window.__fateDesktopUpdateCheckPromise;
    }

    return activeCheckPromise;
  }

  window.fateStartDesktopUpdateCheck = requestUpdateCheck;

  function ensureBanner(){
    if(banner) return;
    banner = document.createElement('aside');
    banner.id = 'desktop-update-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');

    const head = document.createElement('div');
    head.className = 'desktop-update-head';

    const identity = document.createElement('div');
    identity.className = 'desktop-update-identity';

    const pulse = document.createElement('span');
    pulse.className = 'desktop-update-pulse';
    pulse.setAttribute('aria-hidden', 'true');

    bannerKicker = document.createElement('span');
    bannerKicker.className = 'desktop-update-kicker';
    identity.append(pulse, bannerKicker);

    bannerPercent = document.createElement('span');
    bannerPercent.className = 'desktop-update-percent';
    head.append(identity, bannerPercent);

    bannerTitle = document.createElement('div');
    bannerTitle.className = 'desktop-update-title';

    const progressTrack = document.createElement('div');
    progressTrack.className = 'desktop-update-progress';
    progressTrack.setAttribute('role', 'progressbar');
    progressTrack.setAttribute('aria-valuemin', '0');
    progressTrack.setAttribute('aria-valuemax', '100');

    bannerProgress = document.createElement('span');
    bannerProgress.className = 'desktop-update-progress-fill';
    progressTrack.appendChild(bannerProgress);

    const warning = document.createElement('div');
    warning.className = 'desktop-update-warning';

    const warningMark = document.createElement('span');
    warningMark.className = 'desktop-update-warning-mark';
    warningMark.setAttribute('aria-hidden', 'true');
    warningMark.textContent = '!';

    bannerWarning = document.createElement('span');
    warning.append(warningMark, bannerWarning);

    bannerAction = document.createElement('button');
    bannerAction.type = 'button';
    bannerAction.className = 'desktop-update-action';
    bannerAction.textContent = 'Restart and update';
    bannerAction.addEventListener('click', async () => {
      installAttempted = true;
      bannerAction.disabled = true;
      bannerAction.textContent = 'Starting installer...';
      try {
        const result = await updater.install();
        const accepted = result === true || result?.accepted === true;
        if(!accepted) {
          state = normalizedState(Object.assign({}, state || {}, {
            status:'error',
            error:String(result?.error || 'Windows did not accept the update installer.')
          }));
          renderBanner();
          return;
        }
        clearTimeout(installWatchdog);
        installWatchdog = setTimeout(() => {
          state = normalizedState(Object.assign({}, state || {}, {
            status:'error',
            error:'The installer started, but the old game process did not close.'
          }));
          renderBanner();
        }, 6000);
      } catch(err) {
        state = normalizedState(Object.assign({}, state || {}, {
          status:'error',
          error:String(err && err.message || err || 'The update installer failed to start.')
        }));
        renderBanner();
      }
    });

    banner.append(head, bannerTitle, progressTrack, warning, bannerAction);
    document.body.appendChild(banner);
  }

  function renderBanner(){
    const status = String(state?.status || '').toLowerCase();
    const installError = status === 'error' && installAttempted;
    const visibleStatus = status === 'downloading'
      || status === 'ready'
      || status === 'installing'
      || installError;
    if(!window.__fateStartupLoadingFinished || !state || !visibleStatus || !isTitleScreenActive()) {
      if(banner) banner.hidden = true;
      return;
    }

    ensureBanner();
    const ready = status === 'ready';
    const installing = status === 'installing';
    const percent = updatePercent(state);
    const version = state.availableVersion ? ` ${state.availableVersion}` : '';
    bannerKicker.textContent = installError
      ? 'Update Failed'
      : (installing ? 'Installing Update' : (ready ? 'Update Ready' : 'Desktop Update'));
    bannerTitle.textContent = installError
      ? String(state.error || 'The update installer could not start.')
      : (installing
        ? `Starting version${version} installer`
        : (ready
          ? `Version${version} is ready to install`
          : (version ? `Downloading version${version}` : 'Downloading the latest update')));
    const displayPercent = installing || installError ? 100 : percent;
    bannerPercent.textContent = installing ? 'WAIT' : `${displayPercent}%`;
    bannerProgress.style.width = `${displayPercent}%`;
    bannerProgress.parentElement.setAttribute('aria-valuenow', String(displayPercent));
    bannerWarning.textContent = installError
      ? 'Close and reopen the game, then try the update again.'
      : (installing
        ? 'The game will close automatically. Please wait.'
        : (ready
          ? 'Restart before entering multiplayer.'
          : 'Do not enter multiplayer while this update is downloading.'));
    bannerAction.hidden = !ready;
    bannerAction.textContent = 'Restart and update';
    bannerAction.disabled = false;
    banner.hidden = false;
    banner.classList.toggle('is-ready', ready);
    banner.classList.toggle('is-downloading', status === 'downloading' || installing);
    banner.classList.toggle('is-installing', installing);
    banner.classList.toggle('is-error', installError);
  }

  if(updater) {
    updater.onState(nextState => {
      state = normalizedState(nextState);
      if(String(state.status || '').toLowerCase() === 'installing') installAttempted = true;
      renderCurrentVersion(state);
      emitUpdateStatus(state);
      if(stateEndsStartupWait(state)) settleStartupCheck(state);
      renderBanner();
    });
    updater.getState().then(nextState => {
      state = normalizedState(nextState);
      renderCurrentVersion(state);
      emitUpdateStatus(state);
      if(!state.supported || state.status === 'disabled') {
        settleStartupCheck(state);
        return;
      }
      if(state.status === 'idle') {
        requestUpdateCheck({startup:true, timeoutMs:STARTUP_CHECK_TIMEOUT_MS});
        return;
      }
      if(stateEndsStartupWait(state)) settleStartupCheck(state);
      else requestUpdateCheck({startup:true, timeoutMs:STARTUP_CHECK_TIMEOUT_MS});
      renderBanner();
    }).catch(err => {
      state = normalizedState({supported:true, status:'error', error:String(err && err.message || err)});
      emitUpdateStatus(state);
      settleStartupCheck(state);
    });
  } else {
    settleStartupCheck({supported:false, status:'disabled'});
  }

  window.addEventListener('fate-startup-loading-finished', renderBanner);
  window.addEventListener('fate-screen-changed', renderBanner);
})();
