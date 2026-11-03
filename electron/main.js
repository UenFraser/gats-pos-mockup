const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { startServer } = require('../server');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

// ALL paths are decided here, in one place.
const paths = {
  dataDir: app.getPath('userData'),                      // writable, survives updates
  clientDir: path.join(__dirname, '..', 'client-dist'),  // built React app (inside the package)
};

let server;

app.whenReady().then(async () => {
  if (!gotLock) return;
  try {
    server = await startServer({ ...paths, port: 3000 });
    const win = new BrowserWindow({ width: 900, height: 700 });
    win.webContents.on('did-fail-load', (_e, code, desc) =>
      dialog.showErrorBox('Page failed to load', `${code}: ${desc}`));
    win.loadURL(`http://localhost:${server.port}/desktop`);
  } catch (err) {
    dialog.showErrorBox('Server failed to start', String(err.stack || err));
    app.quit();
  }
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => server && server.close());
