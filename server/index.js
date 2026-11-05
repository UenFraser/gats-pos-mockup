const { requireAuth, socketAuth } = require('./auth');
const { registerAuthRoutes } = require('./authRoutes');
const { registerPrintRoutes } = require('./printing/routes');
const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { openDb } = require('./db');
const { seed } = require('./seed');

function lanIp() {
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list) if (i.family === 'IPv4' && !i.internal) return i.address;
  return 'localhost';
}

async function startServer({ dataDir, clientDir, port = 3000 }) {
  const db = openDb(dataDir);
  seed(db);
  const app = express();
  const httpServer = http.createServer(app);
  const io = new Server(httpServer);
  io.use(socketAuth(db));

  // Listen on all interfaces so phones can reach it; fall back to a free port if busy.
  await new Promise((resolve, reject) => {
    httpServer.once('listening', resolve);
    httpServer.on('error', (e) =>
      e.code === 'EADDRINUSE' ? httpServer.listen(0, '0.0.0.0') : reject(e));
    httpServer.listen(port, '0.0.0.0');
  });
  const actualPort = httpServer.address().port;

  app.get('/api/info', requireAuth(db), async (_req, res) => {
    const url = `http://${lanIp()}:${actualPort}/`;
    res.json({ url, qr: await QRCode.toDataURL(url, { margin: 1, width: 240 }) });
  });

  registerPrintRoutes(app);
  registerAuthRoutes(app, db);
  
  app.get('/api/health', (_req, res) => {
    const count = (t) => db.prepare(`SELECT COUNT(*) FROM ${t}`).pluck().get();
    res.json({
      schemaVersion: db.pragma('user_version', { simple: true }),
      categories: count('categories'),
      menuItems: count('menu_items'),
      tokens: count('tokens'),
    });
  });

  app.use(express.static(clientDir));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));

  return {
    port: actualPort,
    close: () => { io.close(); httpServer.close(); db.close(); },
  };
}

module.exports = { startServer };
