const { requireAuth } = require('../services/auth');
const { ZONES, getMenu, getTokens } = require('../services/menu');

function registerMenuRoutes(app, db) {
  const auth = requireAuth(db); // any logged-in user
  const zoneOf = (req, res) => {
    const z = req.query.zone;
    if (z !== undefined && !ZONES.includes(z)) { res.status(400).json({ error: 'Unknown zone' }); return false; }
    return z;
  };

  // ?zone=RESTAURANT|TAKEOUT hides the bar-only categories. No zone = everything.
  app.get('/api/menu', auth, (req, res) => {
    const zone = zoneOf(req, res); if (zone === false) return;
    res.json({ categories: getMenu(db, zone) });
  });

  app.get('/api/tokens', auth, (req, res) => {
    const zone = zoneOf(req, res); if (zone === false) return;
    res.json({ tokens: getTokens(db, zone) });
  });
}

module.exports = { registerMenuRoutes };
