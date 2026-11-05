// Kitchen routing: 1 = items in this category appear on the kitchen display, 0 = bar/drinks only.
// Replaces the old habit of matching category NAMES ('BEVERAGE', 'LIQUOR', 'HARD DRINKS').
exports.up = (db) => db.exec(`
ALTER TABLE categories ADD COLUMN kitchen INTEGER NOT NULL DEFAULT 1 CHECK (kitchen IN (0,1));
UPDATE categories
   SET kitchen = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE name IN ('Beverage','Liquor','Hard Drinks');
`);
