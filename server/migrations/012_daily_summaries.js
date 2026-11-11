// Daily summaries. They are DERIVED from the sales rows (which are never edited or deleted), so this table is only a
// cache with a 10-business-day window. Finished days are also queued in sync_outbox for the future HQ system, which
// keeps every summary for good; the outbox row stays queued until HQ confirms it, so pruning the local copy loses nothing.
// summary_exports records every export: who asked and which manager PIN approved it.
const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";

exports.up = (db) => db.exec(`
CREATE TABLE daily_summaries (
  id TEXT PRIMARY KEY,                       -- the business date, e.g. 2026-11-10
  branch_id TEXT NOT NULL,
  business_date TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL DEFAULT 1,       -- goes up each time a finished day's numbers change
  data_json TEXT NOT NULL,
  hash TEXT NOT NULL,
  finalized INTEGER NOT NULL DEFAULT 0 CHECK (finalized IN (0,1)),
  generated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE summary_exports (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  exported_by TEXT NOT NULL REFERENCES users(id),
  approved_by TEXT NOT NULL REFERENCES users(id),
  dates TEXT NOT NULL,
  format TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
`);
