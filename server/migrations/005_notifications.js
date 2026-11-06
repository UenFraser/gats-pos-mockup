// Replaces the old single-flag notifications (has_cashier_update, cashier_notif_type, ...) that kept only the
// LAST change. Now every change is its own row, so two quick edits are both remembered, with what changed.
// Also stores the bill request on the session (it is a task that stays until the cashier handles it).
const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";

exports.up = (db) => db.exec(`
CREATE TABLE session_notifications (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  audience TEXT NOT NULL CHECK (audience IN ('CASHIER','WAITER')),   -- who is being told
  type TEXT NOT NULL CHECK (type IN ('ADD','VOID','SWAP')),          -- green, red, blue
  summary TEXT NOT NULL,                                             -- e.g. "2x Pizza, 1x Beer"
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT ${NOW},
  read_at TEXT,
  read_by TEXT REFERENCES users(id)
);
CREATE INDEX ix_notif_unread ON session_notifications(session_id, audience) WHERE read_at IS NULL;

ALTER TABLE sessions ADD COLUMN bill_requested_at TEXT;
ALTER TABLE sessions ADD COLUMN bill_requested_by TEXT REFERENCES users(id);
`);
