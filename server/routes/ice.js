const { requireAuth, requireRole } = require('../services/auth');
const ice = require('../services/ice');
const { HttpError } = require('../services/errors');
const log = require('../log');

function registerIceRoutes(app, db, rt) {
  const auth = requireAuth(db);
  const front = requireRole('WAITER', 'CASHIER', 'MANAGER');
  const kitchen = requireRole('KDS', 'MANAGER');
  const handle = (fn) => (req, res) => {
    try { res.json(fn(req)); }
    catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ success: false, error: e.message });
      log.error(`route failed: ${req.method} ${req.url}`, e);
      res.status(500).json({ success: false, error: 'Something went wrong' });
    }
  };

  app.get('/api/ice', auth, handle(() => ({ requests: ice.listActive(db) })));
  app.post('/api/ice', auth, front, handle((req) => ice.requestIce(db, rt, req.user, req.body)));
  app.post('/api/ice/:id/ready', auth, kitchen, handle((req) => ice.markReady(db, rt, req.user, req.params.id)));
  app.post('/api/ice/:id/delivered', auth, front, handle((req) => ice.markDelivered(db, rt, req.user, req.params.id)));
  app.post('/api/ice/:id/follow-up', auth, front, handle((req) => ice.followUp(db, rt, req.user, req.params.id)));
  app.post('/api/ice/:id/cancel', auth, front, handle((req) => ice.cancel(db, rt, req.user, req.params.id)));
}

module.exports = { registerIceRoutes };
