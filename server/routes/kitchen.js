const { requireAuth, requireRole } = require('../services/auth');
const { KitchenError, listOrders, markDone, recall, followUpFood } = require('../services/kitchen');
const log = require('../log');

function registerKitchenRoutes(app, db, rt) {
  const auth = requireAuth(db);
  const kitchenOnly = requireRole('KDS', 'MANAGER');
  const front = requireRole('WAITER', 'CASHIER', 'MANAGER');

  const handle = (fn) => (req, res) => {
    try { res.json(fn(req)); }
    catch (e) {
      if (e instanceof KitchenError) return res.status(e.status).json({ success: false, error: e.message });
      log.error(`kitchen route failed: ${req.method} ${req.url}`, e);
      res.status(500).json({ success: false, error: 'Something went wrong' });
    }
  };

  app.get('/api/kitchen/orders', auth, kitchenOnly, handle((req) => {
    const status = req.query.status || 'active';
    if (!['active', 'done'].includes(status)) throw new KitchenError(400, 'status must be active or done');
    return { orders: listOrders(db, status) };
  }));
  app.post('/api/kitchen/orders/:id/done', auth, kitchenOnly, handle((req) => markDone(db, rt, req.user, req.params.id)));
  app.post('/api/kitchen/orders/:id/recall', auth, kitchenOnly, handle((req) => recall(db, rt, req.user, req.params.id)));

  // Front of house -> kitchen screen only.
  app.post('/api/followups/food', auth, front, handle((req) => followUpFood(db, rt, req.body && req.body.orderItemId)));
}

module.exports = { registerKitchenRoutes };
