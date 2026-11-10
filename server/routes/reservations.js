const { requireAuth, requireRole } = require('../services/auth');
const R = require('../services/reservations');
const { HttpError } = require('../services/errors');
const log = require('../log');

function registerReservationRoutes(app, db, rt) {
  const auth = requireAuth(db);
  const cashier = requireRole('CASHIER', 'MANAGER');
  const handle = (fn) => (req, res) => {
    try { res.json(fn(req)); }
    catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ success: false, error: e.message });
      log.error(`route failed: ${req.method} ${req.url}`, e);
      res.status(500).json({ success: false, error: 'Something went wrong' });
    }
  };
  app.get('/api/reservations', auth, handle(() => ({ reservations: R.list(db) })));
  app.post('/api/reservations', auth, cashier, handle((req) => R.create(db, rt, req.user, req.body)));
  app.patch('/api/reservations/:id', auth, cashier, handle((req) => R.update(db, rt, req.user, req.params.id, req.body)));
  app.delete('/api/reservations/:id', auth, cashier, handle((req) => R.cancel(db, rt, req.user, req.params.id)));
  app.post('/api/reservations/:id/seat', auth, cashier, handle((req) => R.seat(db, rt, req.user, req.params.id)));
}

module.exports = { registerReservationRoutes };
