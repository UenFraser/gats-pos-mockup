const { requireAuth, requireRole } = require('../services/auth');
const { placeOrder, OrderError } = require('../services/orders');
const log = require('../log');

function registerOrderRoutes(app, db, rt) {
  // The HTTP response IS the acknowledgment: the phone clears its cart only when it gets success:true.
  app.post('/api/orders', requireAuth(db), requireRole('WAITER', 'CASHIER', 'MANAGER'), (req, res) => {
    try {
      res.json(placeOrder(db, rt, req.user, req.body));
    } catch (e) {
      if (e instanceof OrderError) return res.status(e.status).json({ success: false, error: e.message });
      log.error('order failed', e);
      res.status(500).json({ success: false, error: 'Could not save the order. Nothing was sent.' });
    }
  });
}

module.exports = { registerOrderRoutes };
