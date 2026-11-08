// For cash: how much the customer handed over (amount_cents is what was applied to the bill, the rest was change).
// Lets a reprinted receipt show the same cash and change as the original.
exports.up = (db) => db.exec(`
ALTER TABLE payments ADD COLUMN tendered_cents INTEGER;
`);
