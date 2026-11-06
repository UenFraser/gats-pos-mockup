// Void approval: the person approving types a 6-digit approval PIN. Only active managers and cashiers
// who were given a PIN (the Lead Cashier) can approve. The PIN identifies the approver (approved_by).
const crypto = require('crypto');
const { nowIso } = require('../db');
const { HttpError } = require('./errors');
const log = require('../log');

const PIN_RE = /^\d{6}$/;
const SCRYPT = { N: 8192 };

// Brute-force protection (in memory; a restart resets it, which is acceptable for a 6-digit PIN behind a login):
const MAX_FAILS = 5;                 // per logged-in person asking for approval
const LOCK_MS = 60 * 1000;
const GLOBAL_MAX = 30;               // across everyone, so many phones cannot take turns guessing
const GLOBAL_WINDOW_MS = 10 * 60 * 1000;
const GLOBAL_LOCK_MS = 5 * 60 * 1000;
const perUser = new Map();
let globalFails = [];
let globalLockedUntil = 0;
const resetLimits = () => { perUser.clear(); globalFails = []; globalLockedUntil = 0; };

function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  return `${salt.toString('hex')}:${crypto.scryptSync(pin, salt, 32, SCRYPT).toString('hex')}`;
}
function pinMatches(pin, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(pin, Buffer.from(saltHex, 'hex'), expected.length, SCRYPT);
  return crypto.timingSafeEqual(actual, expected);
}

const approverRows = (db) => db.prepare(
  "SELECT id, display_name, role, approval_pin_hash FROM users WHERE active = 1 AND role IN ('MANAGER','CASHIER') AND approval_pin_hash IS NOT NULL").all();

const listApprovers = (db) => approverRows(db).map((u) => ({ id: u.id, displayName: u.display_name, role: u.role }));

function setApprovalPin(db, userId, pin) {
  if (typeof pin !== 'string' || !PIN_RE.test(pin)) throw new HttpError(400, 'The approval PIN must be exactly 6 digits');
  const u = db.prepare('SELECT id, role, active FROM users WHERE id = ?').get(userId);
  if (!u || !u.active) throw new HttpError(404, 'User not found');
  if (u.role !== 'MANAGER' && u.role !== 'CASHIER') throw new HttpError(422, 'Only a manager or the Lead Cashier can hold an approval PIN');
  // The PIN alone identifies the approver, so two people may never share one.
  if (approverRows(db).some((o) => o.id !== userId && pinMatches(pin, o.approval_pin_hash)))
    throw new HttpError(409, 'That PIN is already used by someone else. Choose another.');
  db.prepare('UPDATE users SET approval_pin_hash = ?, updated_at = ? WHERE id = ?').run(hashPin(pin), nowIso(), userId);
  return { success: true };
}

function clearApprovalPin(db, userId) {
  const r = db.prepare('UPDATE users SET approval_pin_hash = NULL, updated_at = ? WHERE id = ?').run(nowIso(), userId);
  if (!r.changes) throw new HttpError(404, 'User not found');
  return { success: true };
}

const secondsLeft = (until) => Math.max(1, Math.ceil((until - Date.now()) / 1000));

// requester = the logged-in person asking (their attempts are counted). Returns the approver.
function approve(db, requester, pin) {
  const now = Date.now();
  if (globalLockedUntil > now) throw new HttpError(423, `Approvals are paused after too many wrong PINs. Try again in ${secondsLeft(globalLockedUntil)} seconds.`);
  const mine = perUser.get(requester.id) || { n: 0, lockedUntil: 0 };
  if (mine.lockedUntil > now) throw new HttpError(423, `Too many wrong PINs. Try again in ${secondsLeft(mine.lockedUntil)} seconds.`);
  if (typeof pin !== 'string' || !PIN_RE.test(pin)) throw new HttpError(400, 'Enter the 6-digit approval PIN');

  const hit = approverRows(db).find((u) => pinMatches(pin, u.approval_pin_hash));
  if (hit) {
    perUser.delete(requester.id);
    return { id: hit.id, displayName: hit.display_name, role: hit.role };
  }

  mine.n += 1;
  if (mine.n >= MAX_FAILS) { mine.n = 0; mine.lockedUntil = now + LOCK_MS; }
  perUser.set(requester.id, mine);
  globalFails = globalFails.filter((t) => now - t < GLOBAL_WINDOW_MS).concat(now);
  if (globalFails.length >= GLOBAL_MAX) { globalFails = []; globalLockedUntil = now + GLOBAL_LOCK_MS; }
  log.warn(`wrong approval PIN entered by ${requester.username}`);
  throw new HttpError(403, 'Wrong approval PIN');
}

module.exports = { listApprovers, setApprovalPin, clearApprovalPin, approve, resetLimits };
