const { requireAuth, requireRole } = require('../services/auth');
const { finishCheckout } = require('../services/checkout');
const { printDocument } = require('../services/printing');
const { clearBill } = require('../services/bill');
const { HttpError } = require('../services/errors');
const log = require('../log');

function registerCheckoutRoutes(app, db, rt) {
  const guard = [requireAuth(db), requireRole('CASHIER', 'MANAGER')];
  const handle = (fn) => async (req, res) => {
    try { res.json(await fn(req)); }
    catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ success: false, error: e.message });
      log.error(`route failed: ${req.method} ${req.url}`, e);
      res.status(500).json({ success: false, error: 'Something went wrong' });
    }
  };

  // Close the tab with payments, then print the receipt (and open the drawer for cash if configured).
  // A printing problem never undoes the sale: the response says whether it printed.
  app.post('/api/sessions/:id/close', ...guard, handle(async (req) => {
    return finishCheckout(db, rt, req.user, req.params.id, req.body);
  }));

  // Print the bill for the customer. The bill request is cleared only if it really printed.
  app.post('/api/sessions/:id/print-bill', ...guard, handle(async (req) => {
    const row = db.prepare('SELECT status FROM sessions WHERE id = ?').get(req.params.id);
    if (!row) throw new HttpError(404, 'Tab not found');
    if (row.status !== 'OPEN') throw new HttpError(409, 'This tab is not open');
    const r = await printDocument(db, 'BILL', req.params.id);
    if (r.printed) clearBill(db, rt, req.user, req.params.id);
    return { success: true, ...r };
  }));

  // Reprint the receipt of a closed tab.
  app.post('/api/sessions/:id/print-receipt', ...guard, handle(async (req) => {
    const row = db.prepare('SELECT status FROM sessions WHERE id = ?').get(req.params.id);
    if (!row) throw new HttpError(404, 'Tab not found');
    if (row.status !== 'CLOSED') throw new HttpError(409, 'This tab is not closed yet');
    return { success: true, ...(await printDocument(db, 'RECEIPT', req.params.id)) };
  }));
}

module.exports = { registerCheckoutRoutes };
