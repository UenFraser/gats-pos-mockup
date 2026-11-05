const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { openDb } = require('./db');
const { seed } = require('./seed');
const log = require('./log');
const { createRealtime } = require('./realtime');
const { socketAuth } = require('./services/auth');
const { backupDb } = require('./services/backup');
const { lanAddresses } = require('./services/network');
const { registerAuthRoutes } = require('./routes/auth');
const { registerSystemRoutes } = require('./routes/system');
const { registerMenuRoutes } = require('./routes/menu');
const { registerOrderRoutes } = require('./routes/orders');
const { registerSessionRoutes } = require('./routes/sessions');
const { registerPrintRoutes } = require('./printing/routes');

// config comes from server/config.js (makeConfig)
async function startServer(config) {
  const db = openDb(config.dataDir);
  seed(db);

  // Backup is best-effort: a failed backup must never stop the restaurant from opening.
  try { await backupDb(db, config.backupDir, config.keepBackups); }
  catch (e) { log.error('startup backup failed', e); }

  const app = express();
  const httpServer = http.createServer(app);
  const io = new Server(httpServer);
  io.use(socketAuth(db));
  const rt = createRealtime(io);
  const getPort = () => httpServer.address().port;

  // Every route is registered BEFORE listening, so nothing can arrive early.
  registerSystemRoutes(app, db, { getPort });
  registerAuthRoutes(app, db, rt);
  registerMenuRoutes(app, db);
  registerOrderRoutes(app, db, rt);
  registerSessionRoutes(app, db);
  registerPrintRoutes(app);

  // Unknown /api paths get JSON 404 (not the React page).
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(express.static(config.clientDir));
  app.get('*', (_req, res) => res.sendFile(path.join(config.clientDir, 'index.html')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    log.error(`unhandled error on ${req.method} ${req.url}`, err);
    res.status(500).json({ error: 'Server error' });
  });

  // Listen on all interfaces so phones can reach it; fall back to a free port if busy.
  await new Promise((resolve, reject) => {
    httpServer.once('listening', resolve);
    httpServer.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        log.warn(`port ${config.port} is busy, using a random port (phones/firewall rule must match!)`);
        httpServer.listen(0, config.host);
      } else reject(e);
    });
    httpServer.listen(config.port, config.host);
  });

  const port = getPort();
  log.info(`server listening on ${config.host}:${port}`);
  log.info('LAN addresses (best first): ' + lanAddresses().map((a) => `${a.address} [${a.name}]`).join(', '));

  return {
    port,
    rt,
    close: () => { io.close(); db.close(); }, // io.close() also closes the HTTP server
  };
}

module.exports = { startServer };
