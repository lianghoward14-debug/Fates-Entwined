const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const main = read('electron/main.js');
const preload = read('electron/preload.js');
const updater = read('electron/updater.js');
const renderer = read('src/scripts/26-desktop-updater.js');
const index = read('index.html');
const workflow = read('.github/workflows/build-desktop.yml');

assert(packageJson.dependencies && packageJson.dependencies['electron-updater'], 'electron-updater must be a runtime dependency');
assert(Array.isArray(packageJson.build.publish), 'electron-builder publish configuration is required');
assert(packageJson.build.publish.some(entry => entry.provider === 'github'
  && entry.owner === 'lianghoward14-debug'
  && entry.repo === 'Fates-Entwined'), 'GitHub release provider is misconfigured');
assert(/createDesktopUpdater/.test(main), 'Electron main process does not initialize updater');
assert(/FateDesktopUpdater/.test(preload), 'Preload updater bridge is missing');
assert(/contextIsolation:\s*true/.test(main) && /nodeIntegration:\s*false/.test(main), 'Desktop security boundary changed');
assert(/autoInstallOnAppQuit\s*=\s*true/.test(updater), 'Downloaded updates must install on safe app exit');
assert(/status\s*!==\s*['"]ready['"]/.test(updater), 'Immediate installation must require a ready update');
assert(/autoUpdater\.install\(true,\s*true\)/.test(updater), 'Ready updates must start the verified NSIS installer');
assert(/electronApp\.exit\(0\)/.test(updater), 'The old Electron process must release installed files after starting NSIS');
assert(/before-quit-for-update/.test(updater), 'Forced update exits must preserve Electron update lifecycle signaling');
assert(/isTitleScreenActive/.test(renderer) && /!isTitleScreenActive\(\)/.test(renderer), 'Update progress panel must stay on the title screen');
assert(/nextState\?\.percent/.test(renderer) && /desktop-update-progress/.test(renderer), 'Update progress panel must render live download progress');
assert(/Do not enter multiplayer while this update is downloading\./.test(renderer), 'Update progress panel must warn against starting multiplayer');
assert(/Restart and update/.test(renderer), 'Ready updates must offer a clear install action');
assert(/Update Failed/.test(renderer) && /old game process did not close/.test(renderer), 'Installer handoff failures must remain visible to the player');
assert(/fateStartDesktopUpdateCheck/.test(renderer), 'Updater renderer must expose a startup loading-screen check');
assert(/__fateDesktopUpdateCheckPromise/.test(renderer), 'Updater startup check promise is missing');
assert(/fateStartDesktopUpdateCheck/.test(read('src/scripts/21-smoothness-core.js')), 'Startup loader does not run the integrated updater check');
assert(/Checking for Updates/.test(read('src/scripts/21-smoothness-core.js')), 'Startup loader must present update checking as a normal loading step');
assert(!/id="fate-update-gate"/.test(index), 'Desktop update gate markup must not return');
assert(!/fate-update-queue-spinner/.test(index), 'Separate desktop update spinner must not return');
assert(!/__fateDesktopUpdateGatePromise/.test(renderer), 'Legacy updater gate promise must stay removed');
assert(!/__fateDesktopUpdateGatePromise/.test(read('src/scripts/21-smoothness-core.js')), 'Startup loader must not wait on the removed update gate');
assert(!/updateGateMinimumMs\s*=/.test(renderer), 'Desktop updater must not force a separate minimum-duration gate');
assert(index.includes('src/scripts/26-desktop-updater.js'), 'Updater renderer is not loaded');
assert(index.includes('src/styles/desktop-updater.css'), 'Updater styles are not loaded');
assert(/branches:\s*[\s\S]*- main/.test(workflow), 'Pushes to main must trigger desktop workflow');
assert(/--publish always/.test(workflow), 'Release build must publish updater metadata');
assert(/FATE_RELEASE_VERSION/.test(workflow) && /Fates-Entwined-Installer\.exe/.test(workflow), 'Release workflow must publish a stable installer alias for the website');
assert(!/softprops\/action-gh-release/.test(workflow), 'Release assets must come from one electron-builder publish step');

console.log('Desktop updater smoke test passed');
