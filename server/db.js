const Database = require('better-sqlite3');
const path = require('path');
const { randomUUID } = require('crypto');

// Add new migrations to the END of this list. Never edit one that has shipped.
const MIGRATIONS = [require('./migrations/001_init')];

function migrate(db) {
  const current = db.pragma('user_version', { simple: true });
  for (let i = current; i < MIGRATIONS.length; i++) {
    db.transaction(() => {
      MIGRATIONS[i].up(db);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }
}

function openDb(dataDir) {
  const db = new Database(path.join(dataDir, 'gats-pos.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON'); // SQLite ignores foreign keys unless this is set on every connection
  migrate(db);
  return db;
}

const branchId = (db) => db.prepare("SELECT value FROM settings WHERE key = 'branch_id'").pluck().get();

module.exports = { openDb, branchId, newId: randomUUID, nowIso: () => new Date().toISOString() };
