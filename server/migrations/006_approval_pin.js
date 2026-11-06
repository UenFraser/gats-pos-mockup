// Void approval PIN. SEPARATE from the login secret. Only managers and the designated Lead Cashier
// are given one; regular cashiers have none, so they can never approve a void.
exports.up = (db) => db.exec(`
ALTER TABLE users ADD COLUMN approval_pin_hash TEXT;
`);
