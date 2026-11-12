// Restoring a backup and recovering from a damaged database. The swap always happens BEFORE the database is
// opened (at the next start), never under a running program, and the current database is always kept as a safety copy.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const log = require('../log');
const { HttpError } = require('./errors');
const { RESTORABLE, NAME } = require('./backup');

const DB_FILE = 'gats-pos.db';
const MARKER = 'restore-pending.json';
const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, '').replace(/[-:]/g, '').replace('T', '-');

// A backup is usable if it is a healthy SQLite file with our tables and not NEWER than this program understands.
function validateBackup(file, maxVersion) {
  let db;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true });
    const ok = db.pragma('integrity_check', { simple: true });
    if (ok !== 'ok') return { ok: false, error: 'The backup file is damaged' };
    const version = db.pragma('user_version', { simple: true });
    if (version > maxVersion) return { ok: false, error: 'This backup was made by a newer version of the POS' };
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sessions'").get()) return { ok: false, error: 'This is not a POS backup' };
    return { ok: true, version };
  } catch (e) {
    return { ok: false, error: 'This file cannot be read as a POS backup' };
  } finally {
    if (db) db.close();
  }
}

// Ask for a restore: checks the file, then leaves a note that is carried out at the next start.
function scheduleRestore(dataDir, name, maxVersion) {
  if (typeof name !== 'string' || !RESTORABLE.test(name)) throw new HttpError(400, 'Choose a backup from the list');
  const file = path.join(dataDir, 'backups', name);
  if (!fs.existsSync(file)) throw new HttpError(404, 'That backup file is no longer there');
  const v = validateBackup(file, maxVersion);
  if (!v.ok) throw new HttpError(422, v.error);
  fs.writeFileSync(path.join(dataDir, MARKER), JSON.stringify({ name, requestedAt: new Date().toISOString() }));
  return { name };
}

const rmQuiet = (f) => { try { fs.unlinkSync(f); } catch { /* not there */ } };

// Keep the current database (merging its WAL first when possible) before it is replaced.
function keepSafetyCopy(dataDir, prefix) {
  const live = path.join(dataDir, DB_FILE);
  if (!fs.existsSync(live)) return null;
  try { const d = new Database(live); d.pragma('wal_checkpoint(TRUNCATE)'); d.close(); } catch { /* damaged: copy as it is */ }
  fs.mkdirSync(path.join(dataDir, 'backups'), { recursive: true });
  const dest = path.join(dataDir, 'backups', `${prefix}-${stamp()}.db`);
  fs.copyFileSync(live, dest);
  return dest;
}

function installDatabase(dataDir, source) {
  const live = path.join(dataDir, DB_FILE);
  const tmp = `${live}.restoring`;
  fs.copyFileSync(source, tmp);
  rmQuiet(`${live}-wal`); rmQuiet(`${live}-shm`);
  fs.renameSync(tmp, live);
}

// Call at start, before the database is opened. Returns the restored backup name, or null when nothing was pending.
function applyPendingRestore(dataDir, maxVersion) {
  const markerFile = path.join(dataDir, MARKER);
  if (!fs.existsSync(markerFile)) return null;
  let name;
  try { name = JSON.parse(fs.readFileSync(markerFile, 'utf8')).name; } catch { rmQuiet(markerFile); return null; }
  rmQuiet(markerFile); // whatever happens next, never loop
  const source = path.join(dataDir, 'backups', String(name));
  if (!RESTORABLE.test(String(name)) || !fs.existsSync(source) || !validateBackup(source, maxVersion).ok) {
    log.error(`pending restore skipped: ${name} is missing or not usable`);
    return null;
  }
  const safety = keepSafetyCopy(dataDir, 'before-restore');
  installDatabase(dataDir, source);
  log.info(`restored ${name} (the previous database was kept as ${safety})`);
  return name;
}

// A quick health check of the live database file. ok:true also when there is no database yet (first run).
function checkIntegrity(dataDir) {
  const live = path.join(dataDir, DB_FILE);
  if (!fs.existsSync(live)) return { ok: true, fresh: true };
  let db;
  try {
    db = new Database(live);
    const r = db.pragma('quick_check', { simple: true });
    return r === 'ok' ? { ok: true } : { ok: false, error: String(r) };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    if (db) { try { db.close(); } catch { /* ignore */ } }
  }
}

function newestValidBackup(dataDir, maxVersion) {
  const dir = path.join(dataDir, 'backups');
  if (!fs.existsSync(dir)) return null;
  const names = fs.readdirSync(dir).filter((f) => NAME.test(f)).sort().reverse();
  return names.find((n) => validateBackup(path.join(dir, n), maxVersion).ok) || null;
}

// The database is damaged: keep the broken file (as damaged-...), install the newest healthy backup.
function recoverFromDamage(dataDir, maxVersion) {
  const name = newestValidBackup(dataDir, maxVersion);
  if (!name) return null;
  const kept = keepSafetyCopy(dataDir, 'damaged');
  installDatabase(dataDir, path.join(dataDir, 'backups', name));
  log.warn(`database was damaged; restored ${name} (damaged file kept as ${kept})`);
  return name;
}

module.exports = { validateBackup, scheduleRestore, applyPendingRestore, checkIntegrity, recoverFromDamage, newestValidBackup, MARKER };
