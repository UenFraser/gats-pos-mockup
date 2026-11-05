const { branchId } = require('../db');

const ZONES = ['RESTAURANT', 'BAR', 'TAKEOUT'];
// Alcohol rule: bar_only categories exist only for BAR tokens (or when no zone is given).
const barAllowed = (zone) => !zone || zone === 'BAR';

function getMenu(db, zone) {
  const cats = db.prepare(`
    SELECT id, name, sort_order, bar_only, kitchen FROM categories
    ${barAllowed(zone) ? '' : 'WHERE bar_only = 0'}
    ORDER BY sort_order, name`).all();
  const items = db.prepare(
    'SELECT id, category_id, name, price_cents FROM menu_items WHERE is_available = 1 ORDER BY name').all();
  const byCat = new Map(cats.map((c) => [c.id, []]));
  for (const i of items) byCat.get(i.category_id)?.push({ id: i.id, name: i.name, priceCents: i.price_cents });
  return cats.map((c) => ({
    id: c.id, name: c.name, sortOrder: c.sort_order,
    barOnly: !!c.bar_only, kitchen: !!c.kitchen, items: byCat.get(c.id),
  }));
}

// Phase 4 calls this when an order arrives: the SERVER decides if the item may be sold on that token.
// Returns { id, name, price_cents, kitchen } or null (unknown, unavailable, or alcohol on a non-bar token).
function getOrderableItem(db, menuItemId, zone) {
  return db.prepare(`
    SELECT m.id, m.name, m.price_cents, c.kitchen
      FROM menu_items m JOIN categories c ON c.id = m.category_id
     WHERE m.id = ? AND m.is_available = 1 ${barAllowed(zone) ? '' : 'AND c.bar_only = 0'}`).get(menuItemId) || null;
}

// "In use" is never stored: it is derived from the one RESERVED/OPEN session a token can have.
function getTokens(db, zone) {
  const rows = db.prepare(`
    SELECT t.id, t.token_number, t.zone, s.id AS session_id, s.status
      FROM tokens t
      LEFT JOIN sessions s ON s.token_id = t.id AND s.status IN ('RESERVED','OPEN')
     WHERE t.branch_id = ? ${zone ? 'AND t.zone = ?' : ''}
     ORDER BY CASE t.zone WHEN 'RESTAURANT' THEN 1 WHEN 'BAR' THEN 2 ELSE 3 END,
              CAST(substr(t.token_number, 2) AS INTEGER)`).all(...[branchId(db), ...(zone ? [zone] : [])]);
  return rows.map((r) => ({
    id: r.id, number: r.token_number, zone: r.zone, status: r.status || 'FREE', sessionId: r.session_id,
  }));
}

module.exports = { ZONES, getMenu, getOrderableItem, getTokens };
