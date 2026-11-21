const { requireAuth, requireRole } = require('../services/auth');
const { summary, setZoneCount } = require('../services/tokenAdmin');
const { HttpError } = require('../services/errors');
const log = require('../log');

// Settings > Tables. Managers only.
function registerTokenAdminRoutes(app, db, rt) {
  const guard = [requireAuth(db), requireRole('MANAGER')];
  const handle = (fn) => (req, res) => {
    try { res.json(fn(req)); }
    catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ success: false, error: e.message });
      log.error(`route failed: ${req.method} ${req.url}`, e);
      res.status(500).json({ success: false, error: 'Something went wrong' });
    }
  };
  app.get('/api/settings/tokens', ...guard, handle(() => ({ zones: summary(db) })));
  app.patch('/api/settings/tokens', ...guard, handle((req) => setZoneCount(db, rt, req.user, req.body && req.body.zone, req.body && req.body.count)));
}

module.exports = { registerTokenAdminRoutes };
