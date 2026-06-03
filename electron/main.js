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

let staticServer;

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
            res.writeHead(200, {
              'Content-Type': MIME_TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
              'Cache-Control': 'no-store'
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
