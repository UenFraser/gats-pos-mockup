const { requireAuth } = require('../services/auth');
const { listOpenSessions, getSession } = require('../services/sessions');

function registerSessionRoutes(app, db) {
  const auth = requireAuth(db); // any logged-in user

  app.get('/api/sessions', auth, (req, res) => {
    const status = req.query.status || 'open';
    if (status !== 'open') return res.status(400).json({ error: 'Only status=open is supported yet' });
    res.json({ sessions: listOpenSessions(db) });
  });

  app.get('/api/sessions/:id', auth, (req, res) => {
    const session = getSession(db, req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ session });
  });
}

module.exports = { registerSessionRoutes };
