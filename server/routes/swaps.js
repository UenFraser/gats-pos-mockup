const { requireAuth, requireRole } = require('../services/auth');
const { swapItem } = require('../services/swaps');
const { HttpError } = require('../services/errors');
const log = require('../log');

function registerSwapRoutes(app, db, rt) {
  // Cashier or manager moves an item to another table. (Waiters ask the cashier.)
  app.post('/api/sessions/:id/swaps', requireAuth(db), requireRole('CASHIER', 'MANAGER'), (req, res) => {
    try {
      res.json(swapItem(db, rt, req.user, req.params.id, req.body));
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ success: false, error: e.message });
      log.error('swap failed', e);
      res.status(500).json({ success: false, error: 'Something went wrong' });
    }
  });
}

module.exports = { registerSwapRoutes };
