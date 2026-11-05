const QRCode = require('qrcode');
const { requireAuth } = require('../services/auth');
const { lanIp } = require('../services/network');

function registerSystemRoutes(app, db, { getPort }) {
  // Open on purpose: lets you test a phone's connection before anyone logs in. Counts only.
  app.get('/api/health', (_req, res) => {
    const count = (t) => db.prepare(`SELECT COUNT(*) FROM ${t}`).pluck().get();
    res.json({
      ok: true,
      schemaVersion: db.pragma('user_version', { simple: true }),
      categories: count('categories'),
      menuItems: count('menu_items'),
      tokens: count('tokens'),
    });
  });

  app.get('/api/info', requireAuth(db), async (_req, res) => {
    const url = `http://${lanIp()}:${getPort()}/`;
    res.json({ url, qr: await QRCode.toDataURL(url, { margin: 1, width: 240 }) });
  });
}

module.exports = { registerSystemRoutes };
