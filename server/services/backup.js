// Backups use SQLite's online backup (safe while the database is open, WAL included).
// Besides the normal folder, a copy can go to a SECOND location (a USB drive or a synced cloud folder),
// because backups on the same disk do not survive a dead disk.
const fs = require('fs');
const path = require('path');
const log = require('../log');

const NAME = /^gats-pos-\d{8}-\d{6}\.db$/;
// UTC, sortable: 20261105-083000
const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, '').replace(/[-:]/g, '').replace('T', '-');

function prune(dir, keep) {
  const old = fs.readdirSync(dir).filter((f) => NAME.test(f)).sort().reverse().slice(keep);
  for (const f of old) {
    try { fs.unlinkSync(path.join(dir, f)); log.info(`old backup removed: ${path.join(dir, f)}`); }
    catch (e) { log.warn(`could not remove ${f}: ${e.message}`); }
  }
}

// Returns { file, extra, extraError }. The copy to the second location is best-effort and never fails the backup.
async function backupDb(db, dir, keep = 30, extraDir = null) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `gats-pos-${stamp()}.db`);
  if (fs.existsSync(file)) fs.unlinkSync(file); // two backups in the same second: the newer one replaces the older
  await db.backup(file);
  log.info(`backup written: ${file}`);
  prune(dir, keep);

  let extra = null;
  let extraError = null;
  if (extraDir) {
    try {
      fs.mkdirSync(extraDir, { recursive: true });
      extra = path.join(extraDir, path.basename(file));
      fs.copyFileSync(file, extra);
      prune(extraDir, keep);
      log.info(`backup copied to: ${extra}`);
    } catch (e) {
      extra = null;
      extraError = e.message;
      log.warn(`could not copy the backup to ${extraDir}: ${e.message}`);
    }
  }
  return { file, extra, extraError };
}

// Backups that can be restored, newest first (regular, pre-migration and before-restore copies).
const RESTORABLE = /^(gats-pos-\d{8}-\d{6}|pre-migrate-from-v\d+-\d{8}-\d{6}|before-restore-\d{8}-\d{6}|damaged-\d{8}-\d{6})\.db$/;
function listBackups(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => RESTORABLE.test(f)).map((name) => {
    const st = fs.statSync(path.join(dir, name));
    return { name, sizeBytes: st.size, at: st.mtime.toISOString(),
      kind: name.startsWith('gats-pos-') ? 'backup' : name.startsWith('pre-migrate') ? 'before-update' : name.startsWith('before-restore') ? 'before-restore' : 'damaged' };
  }).sort((a, b) => (a.at < b.at ? 1 : -1));
}

module.exports = { backupDb, listBackups, RESTORABLE, NAME };
