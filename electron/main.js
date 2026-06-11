const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP_NAME = 'Fates Entwined';
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
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8'
};
const LONG_CACHE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico',
  '.mp3', '.wav', '.ogg'
]);
const VERSIONED_CACHE_EXTENSIONS = new Set(['.js', '.mjs', '.css']);

let staticServer;
let mainWindow = null;
const diagnosticsDir = path.join(ROOT, 'diagnostics');

function sanitizeDiagnosticSessionId(value) {
  const clean = String(value || '').replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 80);
  return clean || `session-${Date.now()}`;
}

async function ensureDiagnosticsDir() {
  await fs.promises.mkdir(diagnosticsDir, { recursive: true });
}

function diagnosticPaths(sessionId) {
  const cleanId = sanitizeDiagnosticSessionId(sessionId);
  return {
    latest: path.join(diagnosticsDir, 'fate-main-menu-first-minute-latest.jsonl'),
    session: path.join(diagnosticsDir, `fate-main-menu-first-minute-${cleanId}.jsonl`)
  };
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
  await writeDiagnosticLine(paths, {
    type: 'session-start',
    at: new Date().toISOString(),
    sessionId,
    meta: meta || {}
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

function safePathFromUrl(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const resolved = path.resolve(ROOT, cleanPath);
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) return null;
  return resolved;
}

function startStaticServer() {
  return new Promise((resolve, reject) => {
    staticServer = http.createServer((req, res) => {
      try {
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
            const cacheControl = LONG_CACHE_EXTENSIONS.has(ext) || (VERSIONED_CACHE_EXTENSIONS.has(ext) && /\?v=/.test(url))
              ? 'public, max-age=31536000, immutable'
              : 'no-cache';
            res.writeHead(200, {
              'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
              'Cache-Control': cacheControl
            });
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
          reject(err);
        }
      });
      staticServer.listen(port, '127.0.0.1', () => {
        const address = staticServer.address();
        resolve(`http://localhost:${address.port}/index.html?electron=1`);
      });
    }
    tryListen(FIXED_PORT);
  });
}

function applyPerformanceSwitches() {
  app.commandLine.appendSwitch('force-device-scale-factor', '1');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('disable-features', [
    'CalculateNativeWinOcclusion',
    'ThirdPartyStoragePartitioning',
    'TrackingProtection3pcd',
    'BlockThirdPartyCookies'
  ].join(','));
}

function isAllowedAuthPopupUrl(rawUrl) {
  try {
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

async function createWindow() {
  const startUrl = await startStaticServer();
  const sessionArg = process.argv.find(a => a.startsWith('--session='));
  const sessionName = sessionArg ? sessionArg.split('=')[1] : null;
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
    title: APP_NAME,
    width: 1920,
    height: 1080,
    minWidth: 1024,
    minHeight: 640,
    fullscreen: true,
    backgroundColor: '#06080e',
    icon: path.join(ROOT, 'icon.png'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: webPrefs
  });
  mainWindow = win;

  Menu.setApplicationMenu(null);

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
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
          title: APP_NAME,
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

  await win.loadURL(startUrl);
}

applyPerformanceSwitches();
app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId('com.fatesentwined.desktop');

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (staticServer) staticServer.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
