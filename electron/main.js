const { app, BrowserWindow, dialog, powerSaveBlocker } = require('electron');
const fs = require('fs');
const path = require('path');
const log = require('electron-log/main');
const serverLog = require('../server/log');
const { makeConfig } = require('../server/config');
const { SCHEMA_VERSION } = require('../server/db');
const { startServer } = require('../server');
const { applyPendingRestore, checkIntegrity, recoverFromDamage } = require('../server/services/restore');

let shuttingDown = false;

// ---- single instance: a second launch just focuses the first one ----
const gotLock = app.requestSingleInstanceLock();
let win = null;
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
}

// ALL paths are decided here, in one place (never rename the app: userData follows its name).
const config = makeConfig({
  dataDir: app.getPath('userData'),
  clientDir: path.join(__dirname, '..', 'client-dist'),
  appVersion: app.getVersion(),
});

// ---- crash recovery: if the program itself crashes it restarts, but gives up after 3 crashes in 10 minutes ----
const crashFile = path.join(config.dataDir, 'crashes.json');
function crashAllowsRestart() {
  const now = Date.now();
  let times = [];
  try { times = JSON.parse(fs.readFileSync(crashFile, 'utf8')).filter((t) => now - t < 10 * 60 * 1000); } catch { /* first crash */ }
  times.push(now);
  try { fs.writeFileSync(crashFile, JSON.stringify(times)); } catch { /* ignore */ }
  return times.length <= 3;
}
function fatal(kind, err) {
  log.error(`fatal ${kind}`, err);
  if (shuttingDown) return;
  shuttingDown = true;
  if (crashAllowsRestart()) {
    log.warn('restarting after a crash');
    app.relaunch();
  } else {
    dialog.showErrorBox('The POS keeps crashing', `It crashed 3 times in 10 minutes and will not restart by itself.\nLog file: ${path.join(config.dataDir, 'logs', 'main.log')}`);
  }
  app.exit(1);
}

// ---- logging: file in userData\logs\main.log, plus anything console.* prints ----
log.initialize();
log.transports.file.maxSize = 5 * 1024 * 1024;
log.errorHandler.startCatching({ showDialog: false }); // we decide what happens (below)
Object.assign(console, log.functions);
serverLog.setLogger(log);
process.on('uncaughtException', (e) => fatal('uncaughtException', e));
process.on('unhandledRejection', (e) => log.error('unhandledRejection', e)); // logged; one failed request must not stop service

// What the server can ask of the desktop program (Settings > System).
const hooks = {
  restart: () => { log.info('restart requested'); shuttingDown = true; app.relaunch(); app.exit(0); },
  getAutoStart: () => app.getLoginItemSettings().openAtLogin,
  setAutoStart: (on) => { if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!on }); },
};
if (!app.isPackaged) delete hooks.setAutoStart; // starting with Windows only makes sense for the installed program

let server;
let rendererCrashes = [];

app.whenReady().then(async () => {
  if (!gotLock) return;
  try {
    log.info(`starting v${app.getVersion()}, data: ${config.dataDir}`);
    powerSaveBlocker.start('prevent-app-suspension'); // the PC is the server: it must not go to sleep during service

    // 1. A restore asked for in Settings is carried out now, before the database is opened.
    const restored = applyPendingRestore(config.dataDir, SCHEMA_VERSION);
    if (restored) log.info(`restore applied: ${restored}`);

    // 2. A damaged database is never opened: offer the newest healthy backup instead.
    const health = checkIntegrity(config.dataDir);
    if (!health.ok) {
      log.error(`database check failed: ${health.error}`);
      const choice = dialog.showMessageBoxSync({
        type: 'error', buttons: ['Restore the newest backup', 'Quit'], defaultId: 0, cancelId: 1,
        title: 'The database is damaged',
        message: 'The sales database looks damaged.',
        detail: 'The newest healthy backup can be restored. The damaged file is kept in the backups folder (damaged-...). Anything entered after that backup was made will be missing.',
      });
      if (choice !== 0) { shuttingDown = true; app.quit(); return; }
      const name = recoverFromDamage(config.dataDir, SCHEMA_VERSION);
      if (!name) {
        dialog.showErrorBox('No healthy backup found', `Look in ${path.join(config.dataDir, 'backups')} or ask for help.`);
        shuttingDown = true; app.quit(); return;
      }
      log.info(`recovered from ${name}`);
    }

    server = await startServer(config, hooks);
    win = new BrowserWindow({ width: 900, height: 700 });
    win.webContents.on('did-fail-load', (_e, code, desc) => {
      log.error(`page failed to load: ${code} ${desc}`);
      dialog.showErrorBox('Page failed to load', `${code}: ${desc}`);
    });
    // A crashed or frozen screen reloads itself; if it keeps happening the log tells why.
    win.webContents.on('render-process-gone', (_e, d) => {
      log.error('renderer gone', d);
      const now = Date.now();
      rendererCrashes = rendererCrashes.filter((t) => now - t < 60 * 1000).concat(now);
      if (rendererCrashes.length <= 3 && win && !win.isDestroyed()) setTimeout(() => win && !win.isDestroyed() && win.reload(), 1000);
      else dialog.showErrorBox('The screen keeps crashing', 'Close the program and open it again. If it continues, send the log file.');
    });
    win.on('unresponsive', () => log.warn('window is not responding'));
    win.on('responsive', () => log.info('window responds again'));
    win.on('closed', () => { win = null; });
    app.on('child-process-gone', (_e, d) => log.error('child process gone', d));
    win.loadURL(`http://localhost:${server.port}/desktop`);
  } catch (err) {
    log.error('server failed to start', err);
    dialog.showErrorBox('Server failed to start', String(err.stack || err));
    shuttingDown = true;
    app.quit();
  }
});

app.on('window-all-closed', () => { shuttingDown = true; app.quit(); });
app.on('will-quit', () => { shuttingDown = true; log.info('quitting'); if (server) server.close(); });
