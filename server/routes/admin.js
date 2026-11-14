const { requireAuth, requireRole } = require('../services/auth');
const { getSystemInfo, updateSystemSettings, backupNow, requestRestore, requestFirewallOpen } = require('../services/system');
const { HttpError } = require('../services/errors');
const log = require('../log');

// Settings > System. Managers only.
function registerAdminRoutes(app, db, config, hooks) {
  const guard = [requireAuth(db), requireRole('MANAGER')];
  const handle = (fn) => async (req, res) => {
    try { res.json(await fn(req)); }
    catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ success: false, error: e.message });
      log.error(`route failed: ${req.method} ${req.url}`, e);
      res.status(500).json({ success: false, error: 'Something went wrong' });
    }
  };
  app.get('/api/system', ...guard, handle(async () => ({
    system: { ...getSystemInfo(db, config, hooks), firewall: hooks.firewallStatus ? await hooks.firewallStatus() : null },
  })));
  app.patch('/api/system', ...guard, handle((req) => updateSystemSettings(db, hooks, req.body)));
  app.post('/api/system/backup', ...guard, handle(() => backupNow(db, config)));
  app.post('/api/system/firewall', ...guard, handle((req) => requestFirewallOpen(hooks, req.ip)));
  app.post('/api/system/restore', ...guard, handle((req) => requestRestore(db, config, hooks, req.user, req.body)));
}

module.exports = { registerAdminRoutes };
