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
const { extraBackupDir } = require('./services/system');
const { registerAdminRoutes } = require('./routes/admin');
const { securityHeaders, rateLimit } = require('./security');
const { setReceiptsDir } = require('./services/printing');
const { lanAddresses } = require('./services/network');
const { registerAuthRoutes } = require('./routes/auth');
const { registerSystemRoutes } = require('./routes/system');
const { registerMenuRoutes } = require('./routes/menu');
const { registerOrderRoutes } = require('./routes/orders');
const { registerSessionRoutes } = require('./routes/sessions');
const { registerKitchenRoutes } = require('./routes/kitchen');
const { registerVoidRoutes } = require('./routes/voids');
const { registerApprovalRoutes } = require('./routes/approval');
const { registerSwapRoutes } = require('./routes/swaps');
const { registerCheckoutRoutes } = require('./routes/checkout');
const { registerSettingsRoutes } = require('./routes/settings');
const { registerDiscountRoutes } = require('./routes/discounts');
const { registerIceRoutes } = require('./routes/ice');
const { registerReservationRoutes } = require('./routes/reservations');
const { registerTakeoutRoutes } = require('./routes/takeouts');
const { registerSummaryRoutes } = require('./routes/summaries');
const { refreshSummaries } = require('./services/summary');
const { registerPrintRoutes } = require('./printing/routes');

// config comes from server/config.js (makeConfig)
// hooks (from the desktop program): { restart(), getAutoStart(), setAutoStart(on) }. Optional.
async function startServer(config, hooks = {}) {
  const db = openDb(config.dataDir);
  seed(db);
  setReceiptsDir(path.join(config.dataDir, 'receipts'));

  // Backups are best-effort: a failed backup must never stop the restaurant from opening or working.
  // One at start, then every few hours, each also copied to the second location when one is set (Settings > System).
  const runBackup = async () => {
    try { await backupDb(db, config.backupDir, config.keepBackups, extraBackupDir(db) || null); }
    catch (e) { log.error('backup failed', e); }
  };
  await runBackup();
  const backupTimer = setInterval(runBackup, config.backupEveryHours * 3600 * 1000);
  if (backupTimer.unref) backupTimer.unref();

  // Daily summaries: refresh now and every 15 minutes (cheap; finished days are queued for HQ, old local copies pruned).
  const refresh = () => { try { refreshSummaries(db); } catch (e) { log.error('summary refresh failed', e); } };
  refresh();
  const summaryTimer = setInterval(refresh, 15 * 60 * 1000);
  if (summaryTimer.unref) summaryTimer.unref();

  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders());
  // Limits per client address. The main terminal itself is never limited; logins are limited for everyone.
  const apiLimit = rateLimit({ windowMs: 60 * 1000, max: 1200, skipLoopback: true, message: 'Too many requests.' });
  const loginLimit = rateLimit({ windowMs: 60 * 1000, max: 30, message: 'Too many login attempts.' });
  app.use('/api', apiLimit);
  app.use('/api/auth/login', loginLimit);
  const httpServer = http.createServer(app);
  const io = new Server(httpServer, { maxHttpBufferSize: 1e5 }); // nothing legitimate sends big socket messages
  io.use(socketAuth(db));
  const rt = createRealtime(io);
  const getPort = () => httpServer.address().port;

  // Every route is registered BEFORE listening, so nothing can arrive early.
  registerSystemRoutes(app, db, { getPort });
  registerAuthRoutes(app, db, rt);
  registerMenuRoutes(app, db);
  registerOrderRoutes(app, db, rt);
  registerSessionRoutes(app, db, rt);
  registerKitchenRoutes(app, db, rt);
  registerVoidRoutes(app, db, rt);
  registerApprovalRoutes(app, db);
  registerSwapRoutes(app, db, rt);
  registerCheckoutRoutes(app, db, rt);
  registerSettingsRoutes(app, db);
  registerDiscountRoutes(app, db, rt);
  registerIceRoutes(app, db, rt);
  registerReservationRoutes(app, db, rt);
  registerTakeoutRoutes(app, db, rt);
  registerSummaryRoutes(app, db);
  registerAdminRoutes(app, db, config, hooks);
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
    close: () => { clearInterval(summaryTimer); clearInterval(backupTimer); apiLimit.stop(); loginLimit.stop(); io.close(); db.close(); }, // io.close() also closes the HTTP server
  };
}

module.exports = { startServer };
