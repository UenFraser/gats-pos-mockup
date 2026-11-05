const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

// Add new migrations to the END of this list. Never edit one that has shipped.
const MIGRATIONS = [
  require('./migrations/001_init'),
  require('./migrations/002_auth'),
  require('./migrations/003_kitchen_flag'),
  require('./migrations/004_kitchen_state'),
];

function migrate(db) {
  const current = db.pragma('user_version', { simple: true });
  for (let i = current; i < MIGRATIONS.length; i++) {
    db.transaction(() => {
      MIGRATIONS[i].up(db);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }
}

// Before changing an EXISTING database's structure, keep a full copy next to the normal backups.
// (Not named gats-pos-*.db, so the keep-10 pruning never deletes it.)
function copyBeforeMigrating(db, dataDir, fromVersion) {
  db.pragma('wal_checkpoint(TRUNCATE)'); // fold the WAL into the main file so a plain copy is complete
  const dir = path.join(dataDir, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, '').replace(/[-:]/g, '').replace('T', '-');
  fs.copyFileSync(path.join(dataDir, 'gats-pos.db'), path.join(dir, `pre-migrate-from-v${fromVersion}-${stamp}.db`));
}

function openDb(dataDir) {
  const file = path.join(dataDir, 'gats-pos.db');
  const existed = fs.existsSync(file);
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON'); // SQLite ignores foreign keys unless this is set on every connection
  const current = db.pragma('user_version', { simple: true });
  if (existed && current > 0 && current < MIGRATIONS.length) copyBeforeMigrating(db, dataDir, current);
  migrate(db);
  return db;
}

const branchId = (db) => db.prepare("SELECT value FROM settings WHERE key = 'branch_id'").pluck().get();

module.exports = { openDb, branchId, newId: randomUUID, nowIso: () => new Date().toISOString() };
