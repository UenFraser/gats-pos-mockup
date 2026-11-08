const { requireAuth, requireRole } = require('../services/auth');
const { applyDiscount, removeDiscount } = require('../services/discounts');
const { HttpError } = require('../services/errors');
const log = require('../log');

function registerDiscountRoutes(app, db, rt) {
  const guard = [requireAuth(db), requireRole('CASHIER', 'MANAGER')];
  const handle = (fn) => (req, res) => {
    try { res.json(fn(req)); }
    catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ success: false, error: e.message });
      log.error(`route failed: ${req.method} ${req.url}`, e);
      res.status(500).json({ success: false, error: 'Something went wrong' });
    }
  };
  app.post('/api/sessions/:id/discount', ...guard, handle((req) => applyDiscount(db, rt, req.user, req.params.id, req.body)));
  app.post('/api/sessions/:id/discount/remove', ...guard, handle((req) => removeDiscount(db, rt, req.user, req.params.id, req.body)));
}

module.exports = { registerDiscountRoutes };
