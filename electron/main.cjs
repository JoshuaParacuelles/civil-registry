const { app, BrowserWindow, protocol, net, shell, Menu, session, dialog, ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');

const isDev = !app.isPackaged && !!process.env.ELECTRON_START_URL;
const DEV_URL = process.env.ELECTRON_START_URL || 'http://localhost:5173';
const APP_ORIGIN = 'app://civil-registry';
const DIST_DIR = path.join(__dirname, '..', 'dist');

// Backend settings
const API_PORT = process.env.API_PORT || '5000';
const API_BASE = `http://127.0.0.1:${API_PORT}`;
const API_URLS = [`${API_BASE}/*`, `http://localhost:${API_PORT}/*`];
const BACKEND_DIR = process.env.BACKEND_DIR || path.join(__dirname, '..', '..', 'backend');

// Kung naa kay virtual environment, i-uncomment ug usba ang path:
// const PYTHON_EXE = 'C:\\Users\\ACER\\Desktop\\Fcapstone\\backend\\venv\\Scripts\\python.exe';
const PYTHON_EXE = process.env.PYTHON_EXE || 'python';

const SKIP_BACKEND = process.env.SKIP_BACKEND === '1';
const BACKEND_TIMEOUT_MS = 60000;

// Mga header nga gipadala sa frontend. Kinahanglan naa dinhi kung dili ma-block sa preflight.
const ALLOWED_REQUEST_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'Cache-Control',
  'Pragma',
  'X-Offline-Op-Id',
  'X-Offline-Created-At',
].join(', ');

protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true,
                corsEnabled: true, allowServiceWorkers: false }
}]);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.exit(0);
} else {
  initApp();
}

function initApp() {
  app.setName('Local Civil Register');
  app.setAppUserModelId('ph.civilregistry.desktop');

  const ICON_PATH = path.join(__dirname, '..', 'build', 'icon.ico');

  let win = null;
  let splash = null;
  let backendProc = null;   // only set when THIS app started the backend
  let backendFailed = false;

  // ---------- Backend management ----------

  function logPath() {
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, 'backend.log');
  }

  async function isBackendUp() {
    try {
      const res = await fetch(`${API_BASE}/`, { signal: AbortSignal.timeout(1500) });
      if (!res.ok) return false;
      const body = await res.json();
      return !!body && body.service === 'civil-registry API';
    } catch {
      return false;
    }
  }

  function startBackend() {
    const out = fs.openSync(logPath(), 'a');
    fs.writeSync(out, `\n--- backend start ${new Date().toISOString()} ---\n`);

    const proc = spawn(PYTHON_EXE, ['app.py'], {
      cwd: BACKEND_DIR,
      windowsHide: true,
      stdio: ['ignore', out, out],
      // ELECTRON_MODE=1 makes app.py use SameSite=None; Secure session cookies
      // so the Electron window (app://civil-registry) keeps its login.
      env: { ...process.env, PYTHONUNBUFFERED: '1', ELECTRON_MODE: '1' },
    });

    proc.on('error', (err) => {
      console.error('[backend] failed to start:', err.message);
      backendFailed = true;
    });

    proc.on('exit', (code) => {
      console.log(`[backend] exited with code ${code}`);
      if (backendProc === proc) backendProc = null;
      if (code !== 0 && code !== null) backendFailed = true;
    });

    backendProc = proc;
  }

  async function waitForBackend() {
    const deadline = Date.now() + BACKEND_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (backendFailed) return false;
      if (await isBackendUp()) return true;
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }

  async function ensureBackend() {
    if (SKIP_BACKEND) return true;

    // Gamita ang backend nga naa na nga nagdagan (pananglitan gi-start nimo manually)
    // Note: kung manual nga nagdagan, ELECTRON_MODE wala gyud na-set. I-close ang
    // manual nga terminal sa python app.py kung gusto nimo i-apply ang Electron cookie mode.
    if (await isBackendUp()) return true;

    if (!fs.existsSync(path.join(BACKEND_DIR, 'app.py'))) {
      dialog.showErrorBox('Local Civil Register',
        `Backend not found.\n\nExpected app.py in:\n${BACKEND_DIR}`);
      return false;
    }

    startBackend();
    return waitForBackend();
  }

  function stopBackend() {
    const proc = backendProc;
    backendProc = null;
    if (!proc || proc.exitCode !== null) return;

    if (process.platform === 'win32') {
      // /t = kill tree, /f = force. Ang PID ra niini ang target.
      spawnSync('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { windowsHide: true });
    } else {
      proc.kill('SIGTERM');
    }
  }

  // ---------- Fullscreen ----------

  function setFullscreen(value) {
    if (!win || win.isDestroyed()) return false;
    win.setFullScreen(!!value);
    return win.isFullScreen();
  }

  function toggleFullscreen() {
    return setFullscreen(!(win && win.isFullScreen()));
  }

  // Renderer (Settings button) requests fullscreen changes through these.
  ipcMain.handle('window:is-fullscreen', () => !!(win && !win.isDestroyed() && win.isFullScreen()));
  ipcMain.handle('window:set-fullscreen', (_e, value) => setFullscreen(value));
  ipcMain.handle('window:toggle-fullscreen', () => toggleFullscreen());
  ipcMain.handle('app:version', () => app.getVersion());

  // ---------- Windows ----------

  function createSplash() {
    splash = new BrowserWindow({
      width: 360, height: 160, frame: false, resizable: false,
      alwaysOnTop: true, backgroundColor: '#ffffff', show: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });

    const html = `<!doctype html><html><body style="margin:0;height:100vh;display:flex;
      align-items:center;justify-content:center;font-family:'Segoe UI',sans-serif;
      color:#333;border:1px solid #ddd;box-sizing:border-box">
      <div>Starting Local Civil Register…</div></body></html>`;

    splash.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    splash.on('closed', () => { splash = null; });
  }

  function createWindow() {
    win = new BrowserWindow({
      width: 1366, height: 820, minWidth: 1024, minHeight: 650,
      title: 'Local Civil Register',
      icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
      backgroundColor: '#ffffff',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        devTools: true, // debugging: i-set balik sa isDev kung human na
      },
    });

    win.on('page-title-updated', (e) => e.preventDefault());

    win.once('ready-to-show', () => {
      console.log('[window] ready-to-show fired');
      if (splash) splash.close();
      win.show();
    });

    win.on('closed', () => { win = null; });

    // Ipasabot sa renderer kung nag-usab ang fullscreen state
    // (pananglitan naay nag-Esc o F11), aron ma-update ang Settings button.
    win.on('enter-full-screen', () => {
      if (!win.isDestroyed()) win.webContents.send('window:fullscreen-changed', true);
    });
    win.on('leave-full-screen', () => {
      if (!win.isDestroyed()) win.webContents.send('window:fullscreen-changed', false);
    });

    // Keyboard shortcuts
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;

      // F12 = toggle DevTools (debugging)
      if (input.key === 'F12') {
        win.webContents.toggleDevTools();
        return;
      }

      // F11 = toggle fullscreen
      if (input.key === 'F11') {
        event.preventDefault();
        toggleFullscreen();
        return;
      }

      // Esc = exit fullscreen (only when fullscreen; ordinary Esc still
      // closes modals in the React app because we don't block it otherwise)
      if (input.key === 'Escape' && win.isFullScreen()) {
        event.preventDefault();
        setFullscreen(false);
      }
    });

    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });

    win.webContents.on('will-navigate', (e, url) => {
      if (!url.startsWith(APP_ORIGIN) && !(isDev && url.startsWith(DEV_URL))) {
        e.preventDefault();
        if (/^https?:/.test(url)) shell.openExternal(url);
      }
    });

    win.loadURL(isDev ? DEV_URL : `${APP_ORIGIN}/index.html`);

    // ---------- Diagnostics ----------
    win.webContents.on('did-finish-load', () => {
      console.log('[window] did-finish-load');
    });

    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
      console.error(`[window] failed to load ${url}: ${code} ${desc}`);
      if (splash) splash.close();
      if (win) win.show();
    });

    // Safety: kung wala gihapon ang ready-to-show sulod sa 15 segundos, ipakita ang window
    setTimeout(() => {
      if (win && !win.isVisible()) {
        console.error('[window] ready-to-show did not fire, showing window anyway');
        if (splash) splash.close();
        win.show();
      }
    }, 15000);
  }

  // ---------- Network / protocol ----------

  // Gitugotan ang app://civil-registry nga makig-istorya sa Flask (CORS + session cookie)
  function allowBackendRequests() {
    session.defaultSession.webRequest.onHeadersReceived(
      { urls: API_URLS },
      (details, callback) => {
        const headers = {};

        for (const [key, value] of Object.entries(details.responseHeaders || {})) {
          if (/^access-control-/i.test(key)) continue;

          if (/^set-cookie$/i.test(key)) {
            headers[key] = value.map((c) =>
              c.replace(/;\s*SameSite=\w+/i, '').replace(/;\s*Secure/i, '') +
              '; SameSite=None; Secure'
            );
          } else {
            headers[key] = value;
          }
        }

        headers['Access-Control-Allow-Origin'] = [APP_ORIGIN];
        headers['Access-Control-Allow-Credentials'] = ['true'];
        headers['Access-Control-Allow-Headers'] = [ALLOWED_REQUEST_HEADERS];
        headers['Access-Control-Allow-Methods'] = ['GET, POST, PUT, PATCH, DELETE, OPTIONS'];
        headers['Access-Control-Max-Age'] = ['86400'];

        callback({
          responseHeaders: headers,
          statusLine: details.method === 'OPTIONS' ? 'HTTP/1.1 204 No Content' : details.statusLine,
        });
      }
    );
  }

  function registerAppProtocol() {
    protocol.handle('app', (request) => {
      const { pathname } = new URL(request.url);
      const rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
      let file = path.normalize(path.join(DIST_DIR, rel));

      if (!file.startsWith(DIST_DIR)) return new Response('Forbidden', { status: 403 });

      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        if (path.extname(rel)) return new Response('Not found', { status: 404 });
        file = path.join(DIST_DIR, 'index.html');
      }

      return net.fetch(pathToFileURL(file).toString());
    });
  }

  // ---------- App lifecycle ----------

  app.whenReady().then(async () => {
    if (!isDev) {
      Menu.setApplicationMenu(null);
      registerAppProtocol();
    }

    // Burahin ang service worker at cache na naiwan ng mga naunang run.
    // IndexedDB (offline data) at localStorage ay HINDI apektado.
    await session.defaultSession.clearStorageData({
      storages: ['serviceworkers', 'cachestorage'],
    });

    allowBackendRequests();
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

    createSplash();

    const ok = await ensureBackend();
    if (!ok) {
      if (splash) splash.close();
      dialog.showErrorBox('Local Civil Register',
        `The backend server did not start in time.\n\nSee the log for details:\n${logPath()}`);
      app.quit();
      return;
    }

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  // Hunongon ang backend nga gi-start sa app, ug kana ra
  app.on('before-quit', stopBackend);
  app.on('will-quit', stopBackend);
}