// Startup backup using SQLite's online backup (safe while the database is open, WAL included).
const fs = require('fs');
const path = require('path');
const log = require('../log');

const NAME = /^gats-pos-\d{8}-\d{6}\.db$/;
// UTC, sortable: 20261105-083000
const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, '').replace(/[-:]/g, '').replace('T', '-');

async function backupDb(db, dir, keep = 10) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `gats-pos-${stamp()}.db`);
  await db.backup(file);
  log.info(`backup written: ${file}`);

  const old = fs.readdirSync(dir).filter((f) => NAME.test(f)).sort().reverse().slice(keep);
  for (const f of old) {
    try { fs.unlinkSync(path.join(dir, f)); log.info(`old backup removed: ${f}`); }
    catch (e) { log.warn(`could not remove ${f}: ${e.message}`); }
  }
  return file;
}

module.exports = { backupDb };
