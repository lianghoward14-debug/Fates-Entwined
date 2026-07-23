const assert = require('assert');
const { EventEmitter } = require('events');
const {
  FORCE_EXIT_DELAY_MS,
  createDesktopUpdater
} = require('../electron/updater');

function createHarness(installImplementation) {
  const handlers = new Map();
  const scheduled = [];
  const installCalls = [];
  const nativeEvents = [];
  let exitCode = null;

  const fakeAutoUpdater = new EventEmitter();
  fakeAutoUpdater.checkForUpdates = async () => null;
  fakeAutoUpdater.downloadUpdate = async () => null;
  fakeAutoUpdater.install = (...args) => {
    installCalls.push(args);
    return installImplementation();
  };

  const fakeNativeAutoUpdater = new EventEmitter();
  fakeNativeAutoUpdater.on('before-quit-for-update', () => {
    nativeEvents.push('before-quit-for-update');
  });

  const updater = createDesktopUpdater({
    app: {
      getVersion: () => '1.39.93',
      isPackaged: true,
      exit: code => {
        exitCode = code;
      }
    },
    BrowserWindow: {
      getAllWindows: () => []
    },
    ipcMain: {
      handle: (channel, handler) => handlers.set(channel, handler)
    },
    nativeAutoUpdater: fakeNativeAutoUpdater,
    loadAutoUpdater: () => fakeAutoUpdater,
    scheduleExit: (callback, delay) => {
      const timer = { callback, delay, unrefCalled: false };
      timer.unref = () => {
        timer.unrefCalled = true;
      };
      scheduled.push(timer);
      return timer;
    }
  });

  updater.start();
  fakeAutoUpdater.emit('update-downloaded', { version: '1.39.94' });

  return {
    fakeAutoUpdater,
    getExitCode: () => exitCode,
    handlers,
    installCalls,
    nativeEvents,
    scheduled,
    updater
  };
}

{
  const harness = createHarness(() => true);
  const result = harness.handlers.get('fate:desktop-update-install')();
  assert.deepStrictEqual(result, { accepted: true }, 'A started installer must be acknowledged');
  assert.deepStrictEqual(harness.installCalls, [[true, true]], 'Installer must run silently and relaunch after updating');
  assert.strictEqual(harness.scheduled.length, 1, 'A successful handoff must schedule the forced exit');
  assert.strictEqual(harness.scheduled[0].delay, FORCE_EXIT_DELAY_MS, 'Forced exit delay changed unexpectedly');
  assert.strictEqual(harness.scheduled[0].unrefCalled, true, 'Exit timer must not keep a failed process alive');
  assert.strictEqual(harness.getExitCode(), null, 'The app must not exit before the installer process starts');

  harness.scheduled[0].callback();
  assert.strictEqual(harness.getExitCode(), 0, 'The old app must force a clean process exit');
  assert.deepStrictEqual(harness.nativeEvents, ['before-quit-for-update'], 'Electron update quit event was not emitted');
  harness.updater.stop();
}

{
  const harness = createHarness(() => false);
  const result = harness.handlers.get('fate:desktop-update-install')();
  assert.strictEqual(result.accepted, false, 'A rejected installer launch must not be acknowledged');
  assert.match(result.error, /did not accept/i, 'Rejected installer launch must explain the failure');
  assert.strictEqual(harness.scheduled.length, 0, 'The game must remain open when NSIS does not start');
  assert.strictEqual(
    harness.handlers.get('fate:desktop-update-get-state')().status,
    'error',
    'Rejected installer launch must enter a visible error state'
  );
  harness.updater.stop();
}

{
  const harness = createHarness(() => {
    throw new Error('spawn denied');
  });
  const result = harness.handlers.get('fate:desktop-update-install')();
  assert.deepStrictEqual(result, { accepted: false, error: 'spawn denied' }, 'Thrown launch errors must reach the renderer');
  assert.strictEqual(harness.scheduled.length, 0, 'The game must remain open after a thrown installer error');
  harness.updater.stop();
}

{
  const harness = createHarness(() => true);
  harness.fakeAutoUpdater.emit('update-not-available');
  const result = harness.handlers.get('fate:desktop-update-install')();
  assert.strictEqual(result.accepted, false, 'Install must be rejected when no update is ready');
  assert.strictEqual(harness.installCalls.length, 0, 'NSIS must not launch without a ready update');
  assert.strictEqual(harness.scheduled.length, 0, 'A rejected request must not exit the game');
  harness.updater.stop();
}

console.log('Desktop updater install behavior test passed');
