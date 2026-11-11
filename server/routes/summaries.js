const { requireAuth, requireRole } = require('../services/auth');
const { listSummaries, getSummary, exportSummaries } = require('../services/summary');
const { printSummary } = require('../services/printing');
const { businessDate } = require('../services/businessTime');
const { HttpError } = require('../services/errors');
const log = require('../log');

function registerSummaryRoutes(app, db) {
  const staff = [requireAuth(db), requireRole('CASHIER', 'MANAGER')];
  const handle = (fn) => async (req, res) => {
    try { res.json(await fn(req)); }
    catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ success: false, error: e.message });
      log.error(`route failed: ${req.method} ${req.url}`, e);
      res.status(500).json({ success: false, error: 'Something went wrong' });
    }
  };
  app.get('/api/summaries', ...staff, handle(() => ({ today: businessDate(new Date()), summaries: listSummaries(db) })));
  app.get('/api/summaries/:date', ...staff, handle((req) => ({ summary: getSummary(db, req.params.date) })));
  // Print the closing slip on the receipt printer.
  app.post('/api/summaries/:date/print', ...staff, handle(async (req) => ({ success: true, ...(await printSummary(db, req.params.date)) })));
  // Export a file (CSV or JSON). Manager login AND a manager approval PIN.
  app.post('/api/summaries/export', requireAuth(db), requireRole('MANAGER'), handle((req) => exportSummaries(db, req.user, req.body)));
}

module.exports = { registerSummaryRoutes };
