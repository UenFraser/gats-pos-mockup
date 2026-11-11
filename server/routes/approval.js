const { requireAuth, requireRole } = require('../services/auth');
const { listApprovers, setApprovalPin, clearApprovalPin } = require('../services/approval');
const { HttpError } = require('../services/errors');
const log = require('../log');

// Managers decide who can approve voids: themselves and the designated Lead Cashier.
function registerApprovalRoutes(app, db) {
  const auth = requireAuth(db);
  const manager = requireRole('MANAGER');
  const handle = (fn) => (req, res) => {
    try { res.json(fn(req)); }
    catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ success: false, error: e.message });
      log.error(`route failed: ${req.method} ${req.url}`, e);
      res.status(500).json({ success: false, error: 'Something went wrong' });
    }
  };

  app.get('/api/approvers', auth, manager, handle(() => ({ approvers: listApprovers(db) })));
  const setPin = handle((req) => setApprovalPin(db, req.params.id, req.body && req.body.pin));
  app.put('/api/users/:id/approval-pin', auth, manager, setPin);   // used by tools/set-approval-pin.ps1
  app.patch('/api/users/:id/approval-pin', auth, manager, setPin); // used by the Staff screen
  app.delete('/api/users/:id/approval-pin', auth, manager, handle((req) => clearApprovalPin(db, req.params.id)));
}

module.exports = { registerApprovalRoutes };
