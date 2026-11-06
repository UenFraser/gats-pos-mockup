const { requireAuth, requireRole } = require('../services/auth');
const { listOpenSessions, getSession } = require('../services/sessions');
const { audienceOfViewer, markRead } = require('../services/notifications');
const { requestBill, clearBill } = require('../services/bill');
const { HttpError } = require('../services/errors');
const log = require('../log');

function registerSessionRoutes(app, db, rt) {
  const auth = requireAuth(db); // any logged-in user
  const handle = (fn) => (req, res) => {
    try { res.json(fn(req)); }
    catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ success: false, error: e.message });
      log.error(`route failed: ${req.method} ${req.url}`, e);
      res.status(500).json({ success: false, error: 'Something went wrong' });
    }
  };

  app.get('/api/sessions', auth, handle((req) => {
    const status = req.query.status || 'open';
    if (status !== 'open') throw new HttpError(400, 'Only status=open is supported yet');
    return { sessions: listOpenSessions(db, audienceOfViewer(req.user.role)) };
  }));

  app.get('/api/sessions/:id', auth, handle((req) => {
    const session = getSession(db, req.params.id, audienceOfViewer(req.user.role));
    if (!session) throw new HttpError(404, 'Session not found');
    return { session };
  }));

  // Viewing a tab clears its notifications (for the viewer's side only).
  app.post('/api/sessions/:id/notifications/read', auth, handle((req) => markRead(db, rt, req.user, req.params.id)));

  app.post('/api/sessions/:id/bill-request', auth, requireRole('WAITER', 'CASHIER', 'MANAGER'),
    handle((req) => requestBill(db, rt, req.user, req.params.id)));
  app.delete('/api/sessions/:id/bill-request', auth, requireRole('CASHIER', 'MANAGER'),
    handle((req) => clearBill(db, rt, req.user, req.params.id)));
}

module.exports = { registerSessionRoutes };
