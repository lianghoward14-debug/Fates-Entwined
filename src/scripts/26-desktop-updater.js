(function(){
  'use strict';

  const updater = window.FateDesktopUpdater;
  const STARTUP_CHECK_TIMEOUT_MS = 7000;
  let state = null;
  let banner = null;
  let bannerMessage = null;
  let bannerAction = null;
  let startupCheckStarted = false;
  let startupCheckSettled = false;
  let resolveStartupCheck = null;
  let activeCheckPromise = null;

  window.__fateDesktopUpdateCheckPromise = new Promise(resolve => {
    resolveStartupCheck = resolve;
  });

  function isMatchActive(){
    const game = document.getElementById('s-game');
    return !!(game && game.classList.contains('active'));
  }

  function normalizedState(nextState){
    return Object.assign({supported:!!updater, status:updater ? 'idle' : 'disabled'}, nextState || {});
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

    bannerMessage = document.createElement('span');
    bannerMessage.className = 'desktop-update-message';

    bannerAction = document.createElement('button');
    bannerAction.type = 'button';
    bannerAction.className = 'desktop-update-action';
    bannerAction.textContent = 'Restart and update';
    bannerAction.addEventListener('click', async () => {
      bannerAction.disabled = true;
      try {
        const accepted = await updater.install();
        if(!accepted) bannerAction.disabled = false;
      } catch(err) {
        bannerAction.disabled = false;
      }
    });

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'desktop-update-close';
    close.setAttribute('aria-label', 'Dismiss update notice');
    close.textContent = '\u00d7';
    close.addEventListener('click', () => {
      if(state && state.availableVersion) {
        try { sessionStorage.setItem('fate-dismissed-update', state.availableVersion); } catch(err) {}
      }
      renderBanner();
    });

    banner.append(bannerMessage, bannerAction, close);
    document.body.appendChild(banner);
  }

  function renderBanner(){
    if(!window.__fateStartupLoadingFinished || !state || state.status !== 'ready') {
      if(banner) banner.hidden = true;
      return;
    }
    let dismissed = '';
    try { dismissed = sessionStorage.getItem('fate-dismissed-update') || ''; } catch(err) {}
    if(dismissed && dismissed === state.availableVersion) {
      if(banner) banner.hidden = true;
      return;
    }

    ensureBanner();
    const inMatch = isMatchActive();
    const version = state.availableVersion ? ` ${state.availableVersion}` : '';
    bannerMessage.textContent = inMatch
      ? `Update${version} is ready and will install when you close the game.`
      : `Update${version} is ready.`;
    bannerAction.hidden = inMatch;
    bannerAction.disabled = false;
    banner.hidden = false;
    banner.classList.toggle('is-match-active', inMatch);
  }

  function observeGameScreen(){
    const game = document.getElementById('s-game');
    if(!game) return;
    new MutationObserver(renderBanner).observe(game, { attributes: true, attributeFilter: ['class'] });
  }

  if(updater) {
    updater.onState(nextState => {
      state = normalizedState(nextState);
      emitUpdateStatus(state);
      if(stateEndsStartupWait(state)) settleStartupCheck(state);
      renderBanner();
    });
    updater.getState().then(nextState => {
      state = normalizedState(nextState);
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

  if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeGameScreen, { once: true });
  } else {
    observeGameScreen();
  }
})();
