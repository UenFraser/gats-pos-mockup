// Kitchen history: when an order was recalled, and who marked it done.
exports.up = (db) => db.exec(`
ALTER TABLE order_batches ADD COLUMN recalled_at TEXT;
ALTER TABLE order_batches ADD COLUMN done_by TEXT REFERENCES users(id);
`);
