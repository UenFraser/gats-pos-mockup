// Customer details on a tab. Used by takeouts (name, phone, local/online, pickup time) and reservations
// (name, phone, party size; the time is the existing reservation_time column).
//   order_source LOCAL  = ordered while dining in the building
//   order_source ONLINE = ordered remotely (a phone call now, the website later)
// A cancelled takeout keeps who cancelled it, who approved it and why.
exports.up = (db) => db.exec(`
ALTER TABLE sessions ADD COLUMN customer_name TEXT;
ALTER TABLE sessions ADD COLUMN customer_phone TEXT;
ALTER TABLE sessions ADD COLUMN party_size INTEGER;
ALTER TABLE sessions ADD COLUMN order_source TEXT CHECK (order_source IN ('LOCAL','ONLINE'));
ALTER TABLE sessions ADD COLUMN pickup_at TEXT;
ALTER TABLE sessions ADD COLUMN cancel_reason TEXT;
ALTER TABLE sessions ADD COLUMN cancelled_by TEXT REFERENCES users(id);
ALTER TABLE sessions ADD COLUMN cancel_approved_by TEXT REFERENCES users(id);
`);
