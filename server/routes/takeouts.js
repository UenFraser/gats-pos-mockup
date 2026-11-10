const { requireAuth, requireRole } = require('../services/auth');
const { followUpTakeout, cancelTakeout } = require('../services/takeouts');
const { HttpError } = require('../services/errors');
const log = require('../log');

function registerTakeoutRoutes(app, db, rt) {
  const auth = requireAuth(db);
  const handle = (fn) => (req, res) => {
    try { res.json(fn(req)); }
    catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ success: false, error: e.message });
      log.error(`route failed: ${req.method} ${req.url}`, e);
      res.status(500).json({ success: false, error: 'Something went wrong' });
    }
  };
  // Front of house nudges the kitchen about a whole takeout order.
  app.post('/api/followups/takeout', auth, requireRole('WAITER', 'CASHIER', 'MANAGER'),
    handle((req) => followUpTakeout(db, rt, req.user, req.body && req.body.sessionId)));
  // Nobody collected it: cancel with a manager / Lead Cashier PIN. The food is recorded as voided waste.
  app.post('/api/sessions/:id/cancel', auth, requireRole('CASHIER', 'MANAGER'),
    handle((req) => cancelTakeout(db, rt, req.user, req.params.id, req.body)));
}

module.exports = { registerTakeoutRoutes };
