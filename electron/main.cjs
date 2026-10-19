const { app, BrowserWindow, protocol, net, shell, Menu, session, dialog, ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const { initAutoUpdater } = require('./updater.cjs');

const isDev = !app.isPackaged && !!process.env.ELECTRON_START_URL;
const DEV_URL = process.env.ELECTRON_START_URL || 'http://localhost:5173';
const APP_ORIGIN = 'app://civil-registry';
const DIST_DIR = path.join(__dirname, '..', 'dist');

// ---------- Backend settings ----------

// Render backend URL. Kinahanglan parehas ang URL sa VITE_API_BASE_URL sa package.json.
const REMOTE_API_BASE = 'http://127.0.0.1:5000';

// Para sa development: i-set ang API_BASE_URL=http://127.0.0.1:5000 aron mogamit sa local app.py
const API_BASE = (process.env.API_BASE_URL || REMOTE_API_BASE).replace(/\/+$/, '');
const USE_LOCAL_BACKEND = /127\.0\.0\.1|localhost/.test(API_BASE);

const API_PORT = process.env.API_PORT || '5000';
const API_URLS = USE_LOCAL_BACKEND
  ? [`${API_BASE}/*`, `http://localhost:${API_PORT}/*`]
  : [`${API_BASE}/*`];

// Local mode lang: backend source/exe location
const BACKEND_DIR = process.env.BACKEND_DIR || (app.isPackaged
  ? path.join(process.resourcesPath, 'backend-server')
  : path.join(__dirname, '..', '..', 'backend'));

const BACKEND_ENTRY = app.isPackaged
  ? path.join(BACKEND_DIR, 'backend.exe')
  : path.join(BACKEND_DIR, 'app.py');

// Kung naa kay virtual environment, i-uncomment ug usba ang path:
// const PYTHON_EXE = 'C:\\Users\\ACER\\Desktop\\Fcapstone\\backend\\venv\\Scripts\\python.exe';
const PYTHON_EXE = process.env.PYTHON_EXE || 'python';

const SKIP_BACKEND = process.env.SKIP_BACKEND === '1';

// Render free tier mo-sleep; ang cold start mahimong 30-60 segundos
const BACKEND_TIMEOUT_MS = USE_LOCAL_BACKEND ? 60000 : 90000;

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

// Splash screen messages (user-facing). Kept short and plain.
const MSG = {
  starting:       'Opening Local Civil Register…',
  preparing:      'Getting things ready…',
  waking:         'Waking up the server…',
  startingLocal:  'Starting local services…',
  checkingLocal:  'Checking local services…',
  localReady:     'Local services are ready',
  serverReady:    'Server is ready',
  skipping:       'Skipping server check',
  loadingUi:      'Loading your workspace…',
  dashboard:      'Setting up the dashboard…',
  almostThere:    'Almost there…',
  ready:          'Ready',
};

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
  let backendProc = null;   // only set when THIS app started the local backend
  let backendFailed = false;

  // ---------- Splash progress ----------

  let splashReady = false;
  let splashFinishing = false;
  let splashState = { pct: 0, text: MSG.starting };

  function pushSplash() {
    if (!splash || splash.isDestroyed() || !splashReady) return;
    splash.webContents
      .executeJavaScript(
        `window.setProgress && window.setProgress(${splashState.pct}, ${JSON.stringify(splashState.text)})`
      )
      .catch(() => {});
  }

  function setProgress(pct, text) {
    if (splashFinishing) return;
    if (typeof text === 'string') splashState.text = text;
    splashState.pct = Math.max(splashState.pct, Math.min(100, pct));
    pushSplash();
  }

  // Ipakita ang 100%, dayon i-close ang splash ug ipakita ang main window sa parehas nga higayon
  function finishSplash() {
    if (splashFinishing) return;
    splashFinishing = true;

    splashState.pct = 100;
    splashState.text = MSG.ready;
    pushSplash();

    // Hatagi og gamay nga oras aron makita sa user ang 100%
    setTimeout(() => {
      if (splash && !splash.isDestroyed()) splash.close();
      splash = null;
      if (win && !win.isDestroyed()) win.show();
    }, 600);
  }

  function createSplash() {
    splash = new BrowserWindow({
      width: 420, height: 260, frame: false, resizable: false, center: true,
      backgroundColor: '#ffffff',
      // Hidden until the first frame is painted. Showing it right away is what
      // exposed the empty (black) window before the splash content appeared.
      show: false,
      paintWhenInitiallyHidden: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });

    let splashShown = false;
    const showSplash = () => {
      if (splashShown || !splash || splash.isDestroyed()) return;
      splashShown = true;
      splash.show();
    };

    // Show as soon as the page has painted. The timer is a fallback so the splash
    // never stays hidden if that event does not fire.
    splash.once('ready-to-show', showSplash);
    setTimeout(showSplash, 1500);

    splashReady = false;
    splash.webContents.once('did-finish-load', () => {
      splashReady = true;
      pushSplash();
    });
    splash.on('closed', () => {
      splash = null;
      splashReady = false;
    });

    splash.loadFile(path.join(__dirname, 'splash.html'));
  }

  // ---------- Backend management ----------

  function logPath() {
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, 'backend.log');
  }

  // Gamita ang "/" nga lightweight ug walay Supabase call
  async function isBackendUp() {
    try {
      const res = await fetch(`${API_BASE}/`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return false;
      const body = await res.json();
      return body?.service === 'civil-registry API';
    } catch {
      return false;
    }
  }

  function startBackend() {
    const out = fs.openSync(logPath(), 'a');
    fs.writeSync(out, `\n--- backend start ${new Date().toISOString()} ---\n`);
    fs.writeSync(out, `[backend] mode=${app.isPackaged ? 'packaged' : 'development'}\n`);
    fs.writeSync(out, `[backend] entry=${BACKEND_ENTRY}\n`);

    const cmd = app.isPackaged ? BACKEND_ENTRY : PYTHON_EXE;
    const args = app.isPackaged ? [] : [BACKEND_ENTRY];

    const proc = spawn(cmd, args, {
      cwd: BACKEND_DIR,
      windowsHide: true,
      stdio: ['ignore', out, out],
      // ELECTRON_MODE=1 makes app.py use SameSite=None; Secure session cookies
      // so the Electron window (app://civil-registry) keeps its login.
      env: { ...process.env, PYTHONUNBUFFERED: '1', ELECTRON_MODE: '1' },
    });

    proc.on('error', (err) => {
      console.error('[backend] failed to start:', err.message);
      try {
        fs.writeSync(out, `[backend] failed to start: ${err.message}\n`);
      } catch { /* ignore */ }
      backendFailed = true;
    });

    proc.on('exit', (code) => {
      console.log(`[backend] exited with code ${code}`);
      try {
        fs.writeSync(out, `[backend] exited with code ${code}\n`);
      } catch { /* ignore */ }
      if (backendProc === proc) backendProc = null;
      if (code !== 0 && code !== null) backendFailed = true;
    });

    backendProc = proc;
  }

  async function waitForBackend() {
    const started = Date.now();
    const deadline = started + BACKEND_TIMEOUT_MS;
    const waitingText = USE_LOCAL_BACKEND ? MSG.startingLocal : MSG.waking;

    while (Date.now() < deadline) {
      if (backendFailed) return false;

      if (await isBackendUp()) {
        setProgress(70, USE_LOCAL_BACKEND ? MSG.localReady : MSG.serverReady);
        return true;
      }

      // Estimated progress: mabagal sa dulo, pero dili gihapon mo-stuck
      const elapsed = Date.now() - started;
      setProgress(15 + 55 * (1 - Math.exp(-elapsed / 9000)), waitingText);

      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }

  async function ensureBackend() {
    if (SKIP_BACKEND) {
      setProgress(70, MSG.skipping);
      return true;
    }

    // Remote (Render): ayaw i-start ang local backend
    if (!USE_LOCAL_BACKEND) {
      setProgress(10, MSG.waking);
      return waitForBackend();
    }

    // Local: gamita ang backend nga naa na nga nagdagan, o i-start ang backend.exe / app.py
    setProgress(10, MSG.checkingLocal);
    if (await isBackendUp()) {
      setProgress(70, MSG.localReady);
      return true;
    }

    if (!fs.existsSync(BACKEND_ENTRY)) {
      dialog.showErrorBox('Local Civil Register',
        `Backend not found.\n\nExpected ${path.basename(BACKEND_ENTRY)} in:\n${BACKEND_DIR}`);
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

  // Native page zoom. Unlike CSS zoom, it resizes the viewport, so 100vh layouts
  // fill the window at every text size.
  ipcMain.handle('window:set-zoom', (_e, factor) => {
    if (!win || win.isDestroyed()) return false;
    const f = Math.min(3, Math.max(0.5, Number(factor) || 1));
    win.webContents.setZoomFactor(f);
    return true;
  });

  ipcMain.handle('app:version', () => app.getVersion());

  // ---------- Windows ----------

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
      finishSplash();
    });

    win.on('closed', () => { win = null; });

    // Ipasabot sa renderer kung nag-usab ang fullscreen state
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

      // Esc = exit fullscreen (only when fullscreen)
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

    // ---------- Progress hooks (window loading) ----------
    win.webContents.on('did-start-loading', () => setProgress(74, MSG.loadingUi));
    win.webContents.on('dom-ready', () => setProgress(86, MSG.dashboard));

    // ---------- Diagnostics ----------
    win.webContents.on('did-finish-load', () => {
      console.log('[window] did-finish-load');
      setProgress(94, MSG.almostThere);
    });

    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
      console.error(`[window] failed to load ${url}: ${code} ${desc}`);
      finishSplash();
    });

    win.loadURL(isDev ? DEV_URL : `${APP_ORIGIN}/index.html`);

    // Safety: kung wala gihapon ang ready-to-show sulod sa 15 segundos, ipakita ang window
    setTimeout(() => {
      if (win && !win.isDestroyed() && !win.isVisible()) {
        console.error('[window] ready-to-show did not fire, showing window anyway');
        finishSplash();
      }
    }, 15000);
  }

  // ---------- Network / protocol ----------

  // Gitugotan ang app://civil-registry nga makig-istorya sa backend (CORS + session cookie)
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

    // Ipakita dayon ang loading screen
    createSplash();
    setProgress(5, MSG.starting);

    // Burahin ang service worker at cache na naiwan ng mga naunang run.
    // IndexedDB (offline data) ug localStorage HINDI apektado.
    await session.defaultSession.clearStorageData({
      storages: ['serviceworkers', 'cachestorage'],
    });
    setProgress(8, MSG.preparing);

    allowBackendRequests();
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

    const ok = await ensureBackend();
    if (!ok) {
      if (splash && !splash.isDestroyed()) splash.close();
      const detail = USE_LOCAL_BACKEND
        ? `See the log for details:\n${logPath()}`
        : `Could not reach the server:\n${API_BASE}\n\nCheck your internet connection, then try again.`;
      dialog.showErrorBox('Local Civil Register',
        `The backend server did not respond in time.\n\n${detail}`);
      app.quit();
      return;
    }

    createWindow();

    // Auto-update: i-check ang GitHub Releases human mo-load ang app (packaged build ra)
    initAutoUpdater();

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

  // Hunongon ang backend nga gi-start sa app (local mode ra)
  app.on('before-quit', stopBackend);
  app.on('will-quit', stopBackend);
}