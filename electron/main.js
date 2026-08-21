const { app, BrowserWindow, Menu, shell, ipcMain, crashReporter } = require('electron');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createDesktopUpdater } = require('./updater');

const ROOT = path.resolve(__dirname, '..');
const APP_NAME = 'Fates Entwined';
const DEFAULT_FLY_AUTHORITY_API_URL = 'https://fates-entwined-main.fly.dev';
const DEFAULT_FLY_AUTHORITY_WS_URL = 'wss://fates-entwined-main.fly.dev';
const ELECTRON_CLIENT_BUILD_STAMP = 'phase7-manual-erbs-ali-turn-boundary-20260816i';
const CHROME_VERSION = process.versions.chrome || '126.0.0.0';
const GOOGLE_FRIENDLY_USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`;
const SAFE_MODE_ENABLED = process.argv.includes('--safe-mode') || process.env.FATE_SAFE_MODE === '1';
const GPU_ACCELERATION_FORCE_ENABLED = process.argv.includes('--enable-gpu') || process.env.FATE_ENABLE_GPU === '1';
const GPU_ACCELERATION_FORCE_DISABLED = process.argv.includes('--disable-gpu')
  || SAFE_MODE_ENABLED
  || process.env.FATE_DISABLE_GPU === '1';
const GPU_ACCELERATION_DISABLED = !GPU_ACCELERATION_FORCE_ENABLED && GPU_ACCELERATION_FORCE_DISABLED;
const GPU_ACCELERATION_MODE = GPU_ACCELERATION_DISABLED ? 'disabled-safe-mode' : 'default-enabled';
// Maximized-windowed avoids a fragile exclusive-fullscreen swap-chain during
// the game's heaviest renderer transition. F11 and --fullscreen still opt in.
const START_FULLSCREEN = !SAFE_MODE_ENABLED
  && (process.argv.includes('--fullscreen') || process.env.FATE_FULLSCREEN === '1');
// Authoritative multiplayer is the shipping multiplayer route.  The former
// client-resolved room system is retired, so every desktop launch must enter
// the authoritative route without requiring an internal beta launch flag.
const PHASE7_UNRANKED_BETA_ENABLED = true;
const PHASE7_TEST_AUTH_ENABLED = process.argv.includes('--phase7-test-auth');
const PHASE7_FAST_UI_TEST_ENABLED = process.argv.includes('--phase7-fast-ui-test');
const PHASE7_PRESENTATION_TEST_ENABLED = process.argv.includes('--phase7-presentation-test');
const PHASE7_E2E_BACKGROUND_RUN = process.argv.includes('--e2e-background-run');
if(PHASE7_FAST_UI_TEST_ENABLED && PHASE7_PRESENTATION_TEST_ENABLED){
  throw new Error('Choose exactly one Phase 7 UI test client: fast or presentation timing');
}
if((PHASE7_FAST_UI_TEST_ENABLED || PHASE7_PRESENTATION_TEST_ENABLED)
  && (!PHASE7_UNRANKED_BETA_ENABLED || !PHASE7_TEST_AUTH_ENABLED)){
  throw new Error('Phase 7 UI test clients require --phase7-beta and --phase7-test-auth');
}
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8'
};
const LONG_CACHE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico',
  '.mp3', '.m4a', '.wav', '.ogg'
]);
const VERSIONED_CACHE_EXTENSIONS = new Set(['.js', '.mjs', '.css']);

let staticServer;
let staticServerUrlPromise = null;
let staticServerBaseUrl = '';
let mainWindow = null;
let autoProfileCounter = 1;
const diagnosticsDir = path.join(ROOT, 'diagnostics');
const allowMultipleInstances = process.argv.includes('--allow-multiple-instances');
const pendingGoogleAuthBridges = new Map();
const desktopUpdater = createDesktopUpdater();

function safeStartupLogPath() {
  try {
    return path.join(app.getPath('userData'), 'startup.log');
  } catch (err) {
    return path.join(ROOT, 'diagnostics', 'startup.log');
  }
}

function writeStartupLog(message, details) {
  try {
    const logPath = safeStartupLogPath();
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify({
      at: new Date().toISOString(),
      message,
      details: details || null
    }) + '\n', 'utf8');
  } catch (err) {
    console.warn('Failed to write startup log', err);
  }
}

function startLocalCrashReporter() {
  try {
    crashReporter.start({
      uploadToServer: false,
      compress: true,
      productName: APP_NAME,
      companyName: 'Fates Entwined'
    });
    writeStartupLog('crash-reporter-started', {
      crashDumps: app.getPath('crashDumps')
    });
  } catch (err) {
    writeStartupLog('crash-reporter-failed', {
      error: String(err && err.message || err)
    });
  }
}

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => String(a || '').startsWith(prefix));
  return found ? found.slice(prefix.length) : '';
}

function argValueFrom(argv, name) {
  const prefix = `--${name}=`;
  const found = (Array.isArray(argv) ? argv : []).find(a => String(a || '').startsWith(prefix));
  return found ? String(found).slice(prefix.length) : '';
}

function sanitizeProfileName(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48);
}

function sessionNameFromArgv(argv) {
  return sanitizeProfileName(argValueFrom(argv, 'session') || argValueFrom(argv, 'profile'));
}

function isolateMultiInstanceUserData() {
  const sessionName = sessionNameFromArgv(process.argv);
  if (!allowMultipleInstances || !sessionName) return;
  app.setPath('userData', path.join(app.getPath('appData'), 'fates-entwined-profiles', sessionName));
}

function nextAutoProfileName() {
  autoProfileCounter += 1;
  return `player${autoProfileCounter}`;
}

function electronAuthorityConfig() {
  const mode = String(argValue('authority') || 'fly').trim().toLowerCase();
  if (mode === 'off' || mode === 'none' || mode === 'legacy') return null;
  if (mode === 'local') {
    const apiUrl = String(argValue('authority-api') || 'http://127.0.0.1:8787').replace(/\/+$/, '');
    const wsUrl = String(argValue('authority-ws') || apiUrl.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:')).replace(/\/+$/, '');
    return { mode: 'local', apiUrl, wsUrl };
  }
  const apiUrl = String(argValue('authority-api') || DEFAULT_FLY_AUTHORITY_API_URL).replace(/\/+$/, '');
  const wsUrl = String(argValue('authority-ws') || DEFAULT_FLY_AUTHORITY_WS_URL).replace(/\/+$/, '');
  return { mode: 'fly', apiUrl, wsUrl };
}

function withElectronLaunchParams(rawUrl, sessionName) {
  const url = new URL(rawUrl);
  url.searchParams.set('electron', '1');
  url.searchParams.set('electronBuild', ELECTRON_CLIENT_BUILD_STAMP);
  if (sessionName) url.searchParams.set('electronSession', sessionName);
  if (PHASE7_UNRANKED_BETA_ENABLED) {
    url.searchParams.set('fateV3UnrankedBeta', '1');
    if (PHASE7_TEST_AUTH_ENABLED) {
      url.searchParams.set('fateV3BetaTestAuth', '1');
      // Manual beta clients must be able to exercise the exact local authority
      // code under test instead of silently falling back to the deployed Fly
      // build. Production beta launches still use Fly by default.
      const authority = electronAuthorityConfig();
      if (authority?.mode === 'local') url.searchParams.set('fateV3BetaTestApiUrl', authority.apiUrl);
    }
    if (PHASE7_FAST_UI_TEST_ENABLED) url.searchParams.set('fateV3FullUiE2E', '1');
    if (PHASE7_PRESENTATION_TEST_ENABLED) url.searchParams.set('fateV3PresentationE2E', '1');
    if (PHASE7_FAST_UI_TEST_ENABLED || PHASE7_PRESENTATION_TEST_ENABLED) {
      const passthrough = [
        ['e2e-games', 'e2eGames'],
        ['e2e-start-index', 'e2eStartIndex'],
        ['e2e-run-id', 'e2eRunId'],
        ['e2e-seat', 'e2eSeat'],
        ['e2e-focus-group', 'e2eFocusGroup'],
        ['e2e-max-runtime-ms', 'e2eMaxRuntimeMs'],
        ['e2e-max-actions', 'e2eMaxActions'],
        ['e2e-stall-ms', 'e2eStallMs'],
        ['ui-rev', 'uiRev']
      ];
      for (const [argument, parameter] of passthrough) {
        const value = argValue(argument);
        if (value) url.searchParams.set(parameter, value);
      }
      if (process.argv.includes('--e2e-fresh')) url.searchParams.set('e2eFresh', '1');
      if (process.argv.includes('--e2e-organic-card-campaign')) url.searchParams.set('e2eOrganicCardCampaign', '1');
      if (process.argv.includes('--e2e-strict-card-certification')) url.searchParams.set('e2eStrictCardCertification', '1');
      if (process.argv.includes('--e2e-allow-diagnostic-fallback')) url.searchParams.set('e2eAllowDiagnosticFallback', '1');
    }
  } else {
    const authority = electronAuthorityConfig();
    if (authority) {
      url.searchParams.set('fateAuthority', authority.mode);
      url.searchParams.set('flyWs', authority.wsUrl);
      url.searchParams.set('flyApi', authority.apiUrl);
    }
  }
  return url.toString();
}

function sanitizeDiagnosticSessionId(value) {
  const clean = String(value || '').replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 80);
  return clean || `session-${Date.now()}`;
}

async function ensureDiagnosticsDir() {
  await fs.promises.mkdir(diagnosticsDir, { recursive: true });
}

function diagnosticPaths(sessionId) {
  const cleanId = sanitizeDiagnosticSessionId(sessionId);
  const isMatch = /^match[-_.]/i.test(cleanId);
  const prefix = isMatch ? 'fate-match-performance' : 'fate-main-menu-first-minute';
  return {
    latest: path.join(diagnosticsDir, `${prefix}-latest.jsonl`),
    session: path.join(diagnosticsDir, `${prefix}-${cleanId}.jsonl`)
  };
}

async function prunePreviousMatchDiagnostics(currentPaths) {
  await ensureDiagnosticsDir();
  const currentSession = path.resolve(currentPaths && currentPaths.session || '');
  const currentLatest = path.resolve(currentPaths && currentPaths.latest || '');
  let entries = [];
  try {
    entries = await fs.promises.readdir(diagnosticsDir, { withFileTypes: true });
  } catch (err) {
    return { deleted: 0, errors: [String(err && err.message || err)] };
  }
  let deleted = 0;
  const errors = [];
  await Promise.all(entries.map(async (entry) => {
    if (!entry || !entry.isFile()) return;
    const name = entry.name || '';
    if (!/^fate-match-performance.*\.jsonl$/i.test(name)) return;
    const target = path.resolve(diagnosticsDir, name);
    if (target === currentSession || target === currentLatest) return;
    if (target !== diagnosticsDir && !target.startsWith(diagnosticsDir + path.sep)) return;
    try {
      await fs.promises.unlink(target);
      deleted += 1;
    } catch (err) {
      errors.push(`${name}: ${String(err && err.message || err)}`);
    }
  }));
  return { deleted, errors };
}

async function writeDiagnosticLine(paths, payload, reset) {
  const line = JSON.stringify(payload) + '\n';
  await ensureDiagnosticsDir();
  if (reset) {
    await Promise.all([
      fs.promises.writeFile(paths.latest, line, 'utf8'),
      fs.promises.writeFile(paths.session, line, 'utf8')
    ]);
    return;
  }
  await Promise.all([
    fs.promises.appendFile(paths.latest, line, 'utf8'),
    fs.promises.appendFile(paths.session, line, 'utf8')
  ]);
}

function clampZoomFactor(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0.75, Math.min(1.35, Math.round(n * 100) / 100));
}

ipcMain.handle('fate:get-zoom-factor', (event) => {
  return clampZoomFactor(event.sender.getZoomFactor());
});

ipcMain.handle('fate:set-zoom-factor', (event, factor) => {
  const next = clampZoomFactor(factor);
  event.sender.setZoomFactor(next);
  return clampZoomFactor(event.sender.getZoomFactor());
});

ipcMain.handle('fate:get-performance-info', (event) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  let gpuStatus = null;
  try {
    gpuStatus = app.getGPUFeatureStatus();
  } catch (err) {
    gpuStatus = { error: String(err && err.message || err) };
  }
  let appMetrics = null;
  try {
    appMetrics = app.getAppMetrics().map((metric) => ({
      type: metric.type,
      cpu: metric.cpu,
      memory: metric.memory,
      sandboxed: metric.sandboxed,
      serviceName: metric.serviceName
    }));
  } catch (err) {
    appMetrics = { error: String(err && err.message || err) };
  }
  let webContentsInfo = null;
  try {
    webContentsInfo = senderWindow ? {
      isFocused: senderWindow.webContents.isFocused(),
      isDevToolsOpened: senderWindow.webContents.isDevToolsOpened(),
      isLoading: senderWindow.webContents.isLoading(),
      zoomFactor: clampZoomFactor(senderWindow.webContents.getZoomFactor())
    } : null;
  } catch (err) {
    webContentsInfo = { error: String(err && err.message || err) };
  }
  let windowInfo = null;
  try {
    windowInfo = senderWindow ? {
      isFocused: senderWindow.isFocused(),
      isVisible: senderWindow.isVisible(),
      isFullScreen: senderWindow.isFullScreen(),
      isMaximized: senderWindow.isMaximized(),
      bounds: senderWindow.getBounds(),
      contentBounds: senderWindow.getContentBounds()
    } : null;
  } catch (err) {
    windowInfo = { error: String(err && err.message || err) };
  }
  return {
    isElectron: true,
    versions: process.versions,
    commandSwitches: {
      safeMode: SAFE_MODE_ENABLED,
      hardwareAccelerationDisabled: GPU_ACCELERATION_DISABLED,
      hardwareAccelerationMode: GPU_ACCELERATION_MODE,
      forceDeviceScaleFactor: '1',
      disableBackgroundTimerThrottling: true,
      disableRendererBackgrounding: true,
      disableBackgroundingOccludedWindows: true,
      disabledFeatures: [
        'CalculateNativeWinOcclusion',
        'ThirdPartyStoragePartitioning',
        'TrackingProtection3pcd',
        'BlockThirdPartyCookies'
      ]
    },
    gpuStatus,
    appMetrics,
    windowInfo,
    webContentsInfo
  };
});

ipcMain.handle('fate:start-ui-minute-log', async (event, meta) => {
  const sessionId = sanitizeDiagnosticSessionId(meta && meta.sessionId);
  const paths = diagnosticPaths(sessionId);
  const isMatch = /^match[-_.]/i.test(sessionId);
  const prune = isMatch ? await prunePreviousMatchDiagnostics(paths) : null;
  await writeDiagnosticLine(paths, {
    type: 'session-start',
    at: new Date().toISOString(),
    sessionId,
    meta: meta || {},
    diagnosticsPruned: prune
  }, true);
  return { ok: true, sessionId, paths };
});

ipcMain.handle('fate:append-ui-minute-log', async (event, payload) => {
  const sessionId = sanitizeDiagnosticSessionId(payload && payload.sessionId);
  const paths = diagnosticPaths(sessionId);
  await writeDiagnosticLine(paths, payload || { type: 'empty', sessionId }, false);
  return { ok: true, sessionId, paths };
});

ipcMain.handle('fate:finish-ui-minute-log', async (event, payload) => {
  const sessionId = sanitizeDiagnosticSessionId(payload && payload.sessionId);
  const paths = diagnosticPaths(sessionId);
  await writeDiagnosticLine(paths, Object.assign({
    type: 'session-finish',
    at: new Date().toISOString(),
    sessionId
  }, payload || {}), false);
  return { ok: true, sessionId, paths };
});

ipcMain.handle('fate:begin-external-google-signin', async (event, options = {}) => {
  await startStaticServer();
  const sessionName = sanitizeProfileName(options.sessionName || 'default');
  const state = crypto.randomBytes(24).toString('base64url');
  const authUrl = new URL('/index.html', staticServerBaseUrl);
  authUrl.searchParams.set('electronExternalAuth', '1');
  authUrl.searchParams.set('electronSession', sessionName);
  authUrl.searchParams.set('bridgeState', state);
  authUrl.searchParams.set('bridgeUrl', `${staticServerBaseUrl}/__fate-google-auth-bridge`);
  authUrl.searchParams.set('fresh', String(Date.now()));
  const credentialPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingGoogleAuthBridges.delete(state);
      reject(new Error('Google sign-in timed out'));
    }, 5 * 60 * 1000);
    pendingGoogleAuthBridges.set(state, { resolve, reject, timeout });
  });
  await shell.openExternal(authUrl.toString());
  return await credentialPromise;
});

function safePathFromUrl(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const resolved = path.resolve(ROOT, cleanPath);
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) return null;
  return resolved;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload || {});
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  });
  res.end(body);
}

function readJsonRequest(req, maxBytes = 32768) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON request body'));
      }
    });
    req.on('error', reject);
  });
}

async function handleGoogleAuthBridgeRequest(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }
  let payload;
  try {
    payload = await readJsonRequest(req);
  } catch (err) {
    sendJson(res, 400, { ok: false, error: String(err && err.message || err) });
    return;
  }
  const state = String(payload && payload.state || '');
  const pending = pendingGoogleAuthBridges.get(state);
  if (!pending) {
    sendJson(res, 404, { ok: false, error: 'unknown_or_expired_state' });
    return;
  }
  const idToken = String(payload.idToken || '');
  const accessToken = String(payload.accessToken || '');
  if (!idToken && !accessToken) {
    sendJson(res, 400, { ok: false, error: 'missing_google_credential' });
    return;
  }
  pendingGoogleAuthBridges.delete(state);
  clearTimeout(pending.timeout);
  pending.resolve({
    idToken,
    accessToken,
    email: String(payload.email || ''),
    displayName: String(payload.displayName || '')
  });
  sendJson(res, 200, { ok: true });
}

function startStaticServer() {
  if (staticServerUrlPromise) return staticServerUrlPromise;
  staticServerUrlPromise = new Promise((resolve, reject) => {
    staticServer = http.createServer(async (req, res) => {
      try {
        const requestUrl = new URL(req.url || '/', 'http://localhost');
        if (requestUrl.pathname === '/__fate-google-auth-bridge') {
          await handleGoogleAuthBridgeRequest(req, res);
          return;
        }
        const filePath = safePathFromUrl(req.url || '/');
        if (!filePath) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        fs.stat(filePath, (statErr, stat) => {
          const target = !statErr && stat.isDirectory() ? path.join(filePath, 'index.html') : filePath;
          fs.readFile(target, (readErr, data) => {
            if (readErr) {
              res.writeHead(404);
              res.end('Not found');
              return;
            }
            const ext = path.extname(target).toLowerCase();
            const url = req.url || '';
            const cacheControl = LONG_CACHE_EXTENSIONS.has(ext)
              ? 'public, max-age=31536000, immutable'
              : (VERSIONED_CACHE_EXTENSIONS.has(ext) || ext === '.html'
                ? 'no-store, no-cache, must-revalidate, max-age=0'
                : 'no-cache');
            const headers = {
              'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
              'Cache-Control': cacheControl
            };
            if (cacheControl.includes('no-cache')) {
              headers.Pragma = 'no-cache';
              headers.Expires = '0';
            }
            res.writeHead(200, headers);
            res.end(data);
          });
        });
      } catch (err) {
        res.writeHead(500);
        res.end('Server error');
      }
    });
    const FIXED_PORT = 47891;
    function tryListen(port) {
      staticServer.removeAllListeners('error');
      staticServer.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && port === FIXED_PORT) {
          tryListen(0);
        } else {
          staticServerUrlPromise = null;
          reject(err);
        }
      });
      staticServer.listen(port, '127.0.0.1', () => {
        const address = staticServer.address();
        staticServerBaseUrl = `http://localhost:${address.port}`;
        resolve(`${staticServerBaseUrl}/index.html?electron=1`);
      });
    }
    tryListen(FIXED_PORT);
  });
  return staticServerUrlPromise;
}

function applyPerformanceSwitches() {
  if (SAFE_MODE_ENABLED) {
    const safeUserData = path.join(app.getPath('appData'), 'Fates Entwined Safe Mode');
    app.setPath('userData', safeUserData);
  }
  app.userAgentFallback = GOOGLE_FRIENDLY_USER_AGENT;
  const disabledFeatures = [
    'CalculateNativeWinOcclusion',
    'ThirdPartyStoragePartitioning',
    'TrackingProtection3pcd',
    'BlockThirdPartyCookies'
  ];
  if (GPU_ACCELERATION_DISABLED) {
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('disable-gpu-compositing');
    app.commandLine.appendSwitch('disable-gpu-sandbox');
    app.commandLine.appendSwitch('disable-direct-composition');
    app.commandLine.appendSwitch('disable-accelerated-2d-canvas');
    app.commandLine.appendSwitch('disable-accelerated-video-decode');
    app.commandLine.appendSwitch('disable-gpu-memory-buffer-video-frames');
    disabledFeatures.push('DirectCompositionVideoOverlays');
  }
  app.commandLine.appendSwitch('force-device-scale-factor', '1');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('disable-features', disabledFeatures.join(','));
  writeStartupLog('performance-switches-applied', {
    safeMode: SAFE_MODE_ENABLED,
    gpuAccelerationDisabled: GPU_ACCELERATION_DISABLED,
    gpuAccelerationMode: GPU_ACCELERATION_MODE,
    userData: app.getPath('userData'),
    argv: process.argv
  });
}

function isAllowedAuthPopupUrl(rawUrl) {
  try {
    if (String(rawUrl || '').trim().toLowerCase() === 'about:blank') return true;
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return host === 'accounts.google.com'
      || host === 'apis.google.com'
      || host === 'oauth2.googleapis.com'
      || host === 'www.googleapis.com'
      || host === 'identitytoolkit.googleapis.com'
      || host === 'securetoken.googleapis.com'
      || host === 'www.gstatic.com'
      || host === 'ssl.gstatic.com'
      || host === 'fates-entwined-41491.firebaseapp.com'
      || host.endsWith('.googleusercontent.com');
  } catch (err) {
    return false;
  }
}

async function createWindow(options = {}) {
  const startUrl = await startStaticServer();
  const sessionName = sanitizeProfileName(options.sessionName || sessionNameFromArgv(process.argv));
  const webPrefs = {
    backgroundThrottling: false,
    contextIsolation: true,
    nodeIntegration: false,
    nativeWindowOpen: true,
    preload: path.join(__dirname, 'preload.js'),
    sandbox: true,
    webSecurity: true,
    devTools: true
  };
  if (sessionName) {
    webPrefs.partition = 'persist:' + sessionName;
  }
  const sharedPartition = webPrefs.partition || null;
  const win = new BrowserWindow({
    title: sessionName ? `${APP_NAME} (${sessionName})` : APP_NAME,
    width: SAFE_MODE_ENABLED ? 1280 : 1920,
    height: SAFE_MODE_ENABLED ? 720 : 1080,
    minWidth: 1024,
    minHeight: 640,
    fullscreen: START_FULLSCREEN,
    backgroundColor: '#06080e',
    icon: path.join(ROOT, 'icon.png'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: webPrefs
  });
  desktopUpdater.attachWindow(win);
  mainWindow = win;
  try {
    win.webContents.setUserAgent(GOOGLE_FRIENDLY_USER_AGENT);
  } catch (err) {
    console.warn('Failed to set Electron window user agent', err);
  }
  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = BrowserWindow.getAllWindows().find(candidate => !candidate.isDestroyed()) || null;
    }
  });

  Menu.setApplicationMenu(null);

  win.once('ready-to-show', () => {
    if (!SAFE_MODE_ENABLED && !START_FULLSCREEN) {
      try {
        win.maximize();
      } catch (err) {
        writeStartupLog('window-maximize-failed', { error: String(err && err.message || err) });
      }
    }
    if (PHASE7_E2E_BACKGROUND_RUN) {
      win.showInactive();
      win.minimize();
    } else {
      win.show();
      win.focus();
    }
    win.webContents.send('fate:desktop-window-shown');
  });

  win.webContents.on('render-process-gone', (event, details) => {
    writeStartupLog('render-process-gone', {
      reason: details && details.reason || 'unknown',
      exitCode: details && details.exitCode,
      fullscreen: win.isDestroyed() ? null : win.isFullScreen(),
      maximized: win.isDestroyed() ? null : win.isMaximized(),
      gpuAccelerationMode: GPU_ACCELERATION_MODE
    });
  });
  win.on('unresponsive', () => {
    writeStartupLog('window-unresponsive', {
      fullscreen: win.isDestroyed() ? null : win.isFullScreen(),
      gpuAccelerationMode: GPU_ACCELERATION_MODE
    });
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedAuthPopupUrl(url)) {
      const popupWebPreferences = {
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false,
        nativeWindowOpen: true,
        sandbox: false,
        webSecurity: true
      };
      if (sharedPartition) popupWebPreferences.partition = sharedPartition;
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          title: sessionName ? `${APP_NAME} Sign-In (${sessionName})` : `${APP_NAME} Sign-In`,
          width: 520,
          height: 720,
          minWidth: 420,
          minHeight: 560,
          autoHideMenuBar: true,
          backgroundColor: '#06080e',
          webPreferences: popupWebPreferences
        }
      };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('did-create-window', childWindow => {
    try {
      childWindow.webContents.setUserAgent(GOOGLE_FRIENDLY_USER_AGENT);
    } catch (err) {
      console.warn('Failed to set Electron child window user agent', err);
    }
  });

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  try {
    await win.webContents.session.clearCache();
    await win.webContents.session.clearStorageData({
      storages: ['serviceworkers', 'cachestorage']
    });
  } catch (err) {
    console.warn('Failed to clear local Electron web cache', err);
  }
  try {
    await win.loadURL(withElectronLaunchParams(startUrl, sessionName));
  } catch (err) {
    if (err && err.code === 'ERR_ABORTED' && !win.isDestroyed()) {
      writeStartupLog('initial-navigation-reload-continued', {
        sessionName,
        url: win.webContents.getURL()
      });
      return;
    }
    throw err;
  }
}

isolateMultiInstanceUserData();
applyPerformanceSwitches();
startLocalCrashReporter();
app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId('com.fatesentwined.desktop');
app.on('child-process-gone', (event, details) => {
  writeStartupLog('child-process-gone', {
    type: details && details.type || 'unknown',
    reason: details && details.reason || 'unknown',
    exitCode: details && details.exitCode,
    serviceName: details && details.serviceName || '',
    name: details && details.name || '',
    gpuAccelerationMode: GPU_ACCELERATION_MODE
  });
});

let shouldCreateMainWindow = true;
if (!allowMultipleInstances) {
  shouldCreateMainWindow = app.requestSingleInstanceLock();
  if (!shouldCreateMainWindow) {
    app.quit();
  } else {
    app.on('second-instance', (event, argv) => {
      const requestedSession = sessionNameFromArgv(argv);
      const sessionName = requestedSession || nextAutoProfileName();
      createWindow({ sessionName }).catch(err => {
        console.error('Failed to open additional Electron profile window', err);
        if (!mainWindow) return;
        if (mainWindow.isMinimized()) mainWindow.restore();
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
      });
    });
  }
}

if (shouldCreateMainWindow) {
  app.whenReady().then(() => {
    desktopUpdater.start();
    return createWindow();
  }).catch(err => {
    console.error('Failed to start Electron desktop app', err);
    app.quit();
  });
}

app.on('window-all-closed', () => {
  if (staticServer) staticServer.close();
  desktopUpdater.stop();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
