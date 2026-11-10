const { requireAuth, requireRole } = require('../services/auth');
const { getPrintSettings, setPrintSettings, getBillingSettings, setBillingSettings } = require('../services/settings');
const { printTest } = require('../services/printing');
const { HttpError } = require('../services/errors');
const log = require('../log');

// Receipt and printer settings: managers only.
function registerSettingsRoutes(app, db) {
  const guard = [requireAuth(db), requireRole('MANAGER')];
  const handle = (fn) => async (req, res) => {
    try { res.json(await fn(req)); }
    catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ success: false, error: e.message });
      log.error(`route failed: ${req.method} ${req.url}`, e);
      res.status(500).json({ success: false, error: 'Something went wrong' });
    }
  };

  app.get('/api/settings/print', ...guard, handle(() => ({ settings: getPrintSettings(db) })));
  app.patch('/api/settings/print', ...guard, handle((req) => ({ success: true, settings: setPrintSettings(db, req.body) })));
  app.get('/api/settings/billing', ...guard, handle(() => ({ settings: getBillingSettings(db) })));
  app.patch('/api/settings/billing', ...guard, handle((req) => ({ success: true, settings: setBillingSettings(db, req.body) })));
  app.post('/api/settings/print/test', ...guard, handle(async () => {
    try { return { success: true, ...(await printTest(db)) }; }
    catch (e) { return { success: true, printed: false, error: String(e.message) }; }
  }));
}

module.exports = { registerSettingsRoutes };
