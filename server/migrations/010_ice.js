// Ice is free, so there is no sale. A request goes: requested -> ready (kitchen made it, it waits at the counter)
// -> delivered (front staff took it to the table). "Ready" is a timestamp, so the existing status list stays as it is:
//   status REQUESTED + ready_at empty    = the kitchen is preparing it
//   status REQUESTED + ready_at filled   = ready, waiting to be taken to the table
exports.up = (db) => db.exec(`
ALTER TABLE ice_requests ADD COLUMN ready_at TEXT;
ALTER TABLE ice_requests ADD COLUMN ready_by TEXT REFERENCES users(id);
`);
