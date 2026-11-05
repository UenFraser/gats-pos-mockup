const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const log = require('electron-log/main');
const serverLog = require('../server/log');
const { makeConfig } = require('../server/config');
const { startServer } = require('../server');

// ---- logging: file in userData\logs\main.log, plus anything console.* prints ----
log.initialize();
log.transports.file.maxSize = 5 * 1024 * 1024;
log.errorHandler.startCatching();      // uncaught exceptions and rejections go to the log
Object.assign(console, log.functions);
serverLog.setLogger(log);

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
});

let server;

app.whenReady().then(async () => {
  if (!gotLock) return;
  try {
    log.info(`starting v${app.getVersion()}, data: ${config.dataDir}`);
    server = await startServer(config);
    win = new BrowserWindow({ width: 900, height: 700 });
    win.webContents.on('did-fail-load', (_e, code, desc) => {
      log.error(`page failed to load: ${code} ${desc}`);
      dialog.showErrorBox('Page failed to load', `${code}: ${desc}`);
    });
    win.webContents.on('render-process-gone', (_e, d) => log.error('renderer gone', d));
    win.on('closed', () => { win = null; });
    win.loadURL(`http://localhost:${server.port}/desktop`);
  } catch (err) {
    log.error('server failed to start', err);
    dialog.showErrorBox('Server failed to start', String(err.stack || err));
    app.quit();
  }
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { log.info('quitting'); if (server) server.close(); });
