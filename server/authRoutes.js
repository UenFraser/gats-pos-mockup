const express = require('express');
const A = require('./auth');

const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

function registerAuthRoutes(app, db) {
  app.use('/api', express.json({ limit: '10kb' }));
  const guard = (fn) => (req, res) => {
    try { fn(req, res); }
    catch (e) {
      if (e instanceof A.AuthError) return res.status(e.status).json({ error: e.message });
      console.error(e); res.status(500).json({ error: 'Server error' });
    }
  };
  const auth = A.requireAuth(db);
  const manager = A.requireRole('MANAGER');

  // First run: create the first manager. Only from the main terminal, and only while no users exist.
  app.get('/api/setup/status', guard((_req, res) => res.json({ needsSetup: A.userCount(db) === 0 })));
  app.post('/api/setup', guard((req, res) => {
    if (!isLocal(req)) throw new A.AuthError(403, 'First-time setup must be done on the main terminal');
    if (A.userCount(db) > 0) throw new A.AuthError(409, 'Already set up');
    const { username, displayName, password } = req.body || {};
    res.json({ user: A.createUser(db, { username, displayName, role: 'MANAGER', secret: password }) });
  }));

  // Login screens
  app.get('/api/auth/staff', guard((_req, res) => res.json(A.listStaffForLogin(db))));   // names to tap (no managers)
  app.post('/api/auth/login', guard((req, res) => {
    const { userId, username, secret, device } = req.body || {};
    const user = A.authenticate(db, { userId, username, secret });
    res.json({ token: A.startSession(db, user, device), user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role } });
  }));
  app.post('/api/auth/logout', auth, guard((req, res) => { A.revokeSession(db, req.token); res.json({ ok: true }); }));
  app.get('/api/auth/me', auth, (req, res) => res.json({ user: req.user }));

  // Staff management (managers only)
  app.get('/api/users', auth, manager, guard((_req, res) => res.json(A.listUsers(db))));
  app.post('/api/users', auth, manager, guard((req, res) => {
    const { username, displayName, role, secret } = req.body || {};
    res.json({ user: A.createUser(db, { username, displayName, role, secret }) });
  }));
  app.patch('/api/users/:id', auth, manager, guard((req, res) => res.json({ user: A.updateUser(db, req.params.id, req.body || {}) })));
}

module.exports = { registerAuthRoutes };
