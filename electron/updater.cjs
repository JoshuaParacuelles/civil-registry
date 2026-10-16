const { app } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');
const path = require('path');

const FIRST_CHECK_DELAY_MS = 15 * 1000;      // 15 segundos human ablihi ang app
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;   // matag 4 ka oras

function logLine(msg) {
  try {
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'update.log'), `${new Date().toISOString()} ${msg}\n`);
  } catch {
    /* ignore */
  }
}

function initAutoUpdater() {
  // Dili molihok sa development (npm run electron:dev)
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;          // i-download sa background
  autoUpdater.autoInstallOnAppQuit = true;  // i-install inig-close sa app
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = { info: logLine, warn: logLine, error: logLine, debug: () => {} };

  autoUpdater.on('checking-for-update', () => {
    logLine('checking for update');
  });

  autoUpdater.on('update-available', (info) => {
    logLine(`update available: ${info.version}`);
  });

  autoUpdater.on('update-not-available', () => {
    logLine('already on latest version');
  });

  autoUpdater.on('download-progress', (p) => {
    logLine(`downloading: ${Math.round(p.percent)}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    logLine(`update downloaded: ${info.version}, will install on next app close`);
  });

  autoUpdater.on('error', (err) => {
    logLine(`error: ${err?.message || err}`);
  });

  const check = () => {
    autoUpdater.checkForUpdates().catch((err) => {
      logLine(`check failed: ${err?.message || err}`);
    });
  };

  setTimeout(check, FIRST_CHECK_DELAY_MS);
  setInterval(check, CHECK_EVERY_MS);
}

module.exports = { initAutoUpdater };