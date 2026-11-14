// Settings > System: where the data lives, backups (including a second location), start with Windows, and restore.
const fs = require('fs');
const path = require('path');
const { HttpError } = require('./errors');
const { approve } = require('./approval');
const { backupDb, listBackups } = require('./backup');
const { scheduleRestore } = require('./restore');
const { lanAddresses } = require('./network');
const { SCHEMA_VERSION } = require('../db');
const { BUILD } = require('../build');

const getSetting = (db, key) => db.prepare('SELECT value FROM settings WHERE key = ?').pluck().get(`system.${key}`);
const setSetting = (db, key, value) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(`system.${key}`, value);
const extraBackupDir = (db) => getSetting(db, 'backup_dir') || '';

function writable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.write-test-${process.pid}`);
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return true;
  } catch { return false; }
}

function getSystemInfo(db, config, hooks = {}) {
  const dbFile = path.join(config.dataDir, 'gats-pos.db');
  const backups = listBackups(config.backupDir);
  const extra = extraBackupDir(db);
  return {
    appVersion: config.appVersion || '', builds: { server: BUILD, main: hooks.mainBuild || 'unknown' }, schemaVersion: db.pragma('user_version', { simple: true }), uptimeSeconds: Math.round(process.uptime()),
    dataDir: config.dataDir, dbSizeBytes: fs.existsSync(dbFile) ? fs.statSync(dbFile).size : 0,
    port: config.port, addresses: lanAddresses().map((a) => `${a.address} (${a.name})`),
    backups: backups.slice(0, 20), lastBackupAt: (backups.find((b) => b.kind === 'backup') || {}).at || null,
    extraBackupDir: extra, extraBackupOk: extra ? writable(extra) : null,
    autoStartAvailable: !!hooks.setAutoStart, autoStart: hooks.getAutoStart ? !!hooks.getAutoStart() : false,
  };
}

function updateSystemSettings(db, hooks = {}, body) {
  const b = body || {};
  if (b.backupDir !== undefined) {
    const dir = typeof b.backupDir === 'string' ? b.backupDir.trim() : '';
    if (dir.length > 260) throw new HttpError(400, 'That folder path is too long');
    if (dir && !path.isAbsolute(dir)) throw new HttpError(400, 'Enter the full path, for example E:\\GatsBackups');
    if (dir && !writable(dir)) throw new HttpError(422, 'The POS cannot write to that folder. Is the drive connected?');
    setSetting(db, 'backup_dir', dir);
  }
  if (b.autoStart !== undefined) {
    if (!hooks.setAutoStart) throw new HttpError(422, 'Starting with Windows only works in the installed program');
    hooks.setAutoStart(!!b.autoStart);
    setSetting(db, 'auto_start', b.autoStart ? '1' : '0');
  }
  return { success: true };
}

async function backupNow(db, config) {
  const r = await backupDb(db, config.backupDir, config.keepBackups, extraBackupDir(db) || null);
  return { success: true, name: r.file.split(/[\\/]/).pop(), copiedToExtra: !!r.extra, extraError: r.extraError };
}

// Only a MANAGER's approval PIN can restore. The program restarts to apply it; the current data is kept as a safety copy.
function requestRestore(db, config, hooks = {}, user, body) {
  const b = body || {};
  const approver = approve(db, user, b.approvalPin);
  if (approver.role !== 'MANAGER') throw new HttpError(403, 'A manager PIN is needed to restore a backup');
  scheduleRestore(config.dataDir, b.name, SCHEMA_VERSION);
  if (hooks.restart) setTimeout(() => hooks.restart(), 800); // after this reply has been sent
  return { success: true, willRestart: !!hooks.restart, name: b.name };
}

// Phones cannot reach the POS until Windows Firewall allows it. The desktop program can ask Windows (it shows a permission
// prompt on the POS computer). Only the POS computer itself may start this.
function requestFirewallOpen(hooks = {}, ip) {
  const local = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (!local) throw new HttpError(403, 'Do this on the POS computer itself (Windows asks for permission on its screen)');
  if (!hooks.allowFirewall) throw new HttpError(422, 'This only works in the installed program on Windows');
  hooks.allowFirewall();
  return { success: true };
}

module.exports = { getSystemInfo, updateSystemSettings, backupNow, requestRestore, requestFirewallOpen, extraBackupDir };
