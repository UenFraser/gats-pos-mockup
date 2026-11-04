const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";

exports.up = (db) => db.exec(`
ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TEXT;

-- Only a hash of each login token is stored, so a copied database cannot be used to log in.
CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  device TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  last_seen_at TEXT NOT NULL DEFAULT ${NOW},
  revoked_at TEXT
);
CREATE INDEX ix_auth_sessions_user ON auth_sessions(user_id);
`);
