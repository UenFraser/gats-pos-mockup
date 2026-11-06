const { requireAuth, requireRole } = require('../services/auth');
const { voidItem, listVoids } = require('../services/voids');
const { HttpError } = require('../services/errors');
const log = require('../log');

function registerVoidRoutes(app, db, rt) {
  const auth = requireAuth(db);
  const handle = (fn) => (req, res) => {
    try { res.json(fn(req)); }
    catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ success: false, error: e.message });
      log.error(`route failed: ${req.method} ${req.url}`, e);
      res.status(500).json({ success: false, error: 'Something went wrong' });
    }
  };

  // A waiter or cashier asks; whoever types a valid approval PIN (manager or Lead Cashier) approves.
  app.post('/api/sessions/:id/voids', auth, requireRole('WAITER', 'CASHIER', 'MANAGER'),
    handle((req) => voidItem(db, rt, req.user, req.params.id, req.body)));
  app.get('/api/sessions/:id/voids', auth, requireRole('CASHIER', 'MANAGER'),
    handle((req) => ({ voids: listVoids(db, req.params.id) })));
}

module.exports = { registerVoidRoutes };
