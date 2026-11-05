const { newId } = require('./db');
const menu = require('./seed/menu.json'); // required (not read with fs) so it is always bundled

// Categories that never go to the kitchen display (drinks).
const NO_KITCHEN = new Set(['Beverage', 'Liquor', 'Hard Drinks']);

// Runs once on a fresh database: branch id, categories, menu, and the 45 tokens.
function seed(db) {
  if (db.prepare("SELECT 1 FROM settings WHERE key = 'seeded'").get()) return;
  db.transaction(() => {
    const branchId = newId();
    db.prepare("INSERT INTO settings (key, value) VALUES ('branch_id', ?), ('seeded', '1')").run(branchId);

    const insCat = db.prepare('INSERT INTO categories (id, name, sort_order, bar_only, kitchen) VALUES (?, ?, ?, ?, ?)');
    const catIds = {};
    for (const c of menu.categories) {
      catIds[c.name] = newId();
      insCat.run(catIds[c.name], c.name, c.sort_order, c.bar_only, NO_KITCHEN.has(c.name) ? 0 : 1);
    }
    const insItem = db.prepare('INSERT INTO menu_items (id, category_id, name, price_cents, is_available) VALUES (?, ?, ?, ?, ?)');
    for (const i of menu.items) insItem.run(newId(), catIds[i.category], i.name, i.price_cents, i.is_available);

    const insTok = db.prepare('INSERT INTO tokens (id, branch_id, token_number, zone) VALUES (?, ?, ?, ?)');
    for (const [prefix, zone] of [['T', 'RESTAURANT'], ['B', 'BAR'], ['R', 'TAKEOUT']])
      for (let n = 1; n <= 15; n++) insTok.run(newId(), branchId, `${prefix}${n}`, zone);
  })();
}

module.exports = { seed };
