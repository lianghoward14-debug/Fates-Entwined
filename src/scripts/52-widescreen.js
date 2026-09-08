(function () {
  'use strict';
  var storageKey = 'fate_widescreen_mode';
  var enabled = false;
  try { enabled = localStorage.getItem(storageKey) === '1'; } catch (_) {}

  function apply() {
    document.documentElement.classList.toggle('fate-widescreen', enabled);
    var button = document.getElementById('widescreen-toggle-btn');
    if (button) {
      button.textContent = 'Widescreen ' + (enabled ? 'On' : 'Off');
      button.setAttribute('aria-pressed', String(enabled));
    }
    // Allow CSS layout to settle before invalidating canvas and hit-test caches.
    requestAnimationFrame(function () {
      if (window.FateMatchRendererAdapter) {
        window.FateMatchRendererAdapter.resetBoardViewport?.('widescreen-mode');
      }
      window.dispatchEvent(new Event('resize'));
    });
  }

  window.FateWidescreen = {
    toggle: function () {
      enabled = !enabled;
      try { localStorage.setItem(storageKey, enabled ? '1' : '0'); } catch (_) {}
      apply();
      return enabled;
    },
    isEnabled: function () { return enabled; }
  };
  apply();
})();
