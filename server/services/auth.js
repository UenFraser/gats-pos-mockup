// Authentication logic. Depends only on Node's crypto and a better-sqlite3 handle.
const crypto = require('crypto');

class AuthError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const PIN_ROLES = ['WAITER', 'CASHIER', 'KDS'];      // log in with a 6-digit PIN
const ROLES = [...PIN_ROLES, 'MANAGER'];             // managers use a password
const APPROVER_ROLES = ['CASHIER', 'MANAGER'];       // may approve voids
const MAX_FAILS = 5;
const LOCK_MS = 60 * 1000;

const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();
const branchId = (db) => db.prepare("SELECT value FROM settings WHERE key = 'branch_id'").pluck().get() || 'unknown';
const publicUser = (u) => ({ id: u.id, username: u.username, displayName: u.display_name, role: u.role });

// ---- secrets: scrypt with a random salt, stored as "salt:hash" (hex) ----
function hashSecret(secret) {
  const salt = crypto.randomBytes(16);
  return `${salt.toString('hex')}:${crypto.scryptSync(secret, salt, 32).toString('hex')}`;
}
function checkSecret(secret, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(secret, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}
function validateSecret(role, secret) {
  if (!ROLES.includes(role)) return 'Unknown role';
  if (typeof secret !== 'string') return 'A PIN or password is required';
  if (PIN_ROLES.includes(role)) return /^\d{6}$/.test(secret) ? null : 'PIN must be exactly 6 digits';
  return secret.length >= 8 ? null : 'Password must be at least 8 characters';
}

// ---- users ----
const userCount = (db) => db.prepare('SELECT COUNT(*) FROM users').pluck().get();
const activeManagers = (db) => db.prepare("SELECT COUNT(*) FROM users WHERE role = 'MANAGER' AND active = 1").pluck().get();

function createUser(db, { username, displayName, role, secret }) {
  const err = validateSecret(role, secret);
  if (err) throw new AuthError(400, err);
  if (!String(username || '').trim() || !String(displayName || '').trim()) throw new AuthError(400, 'Username and name are required');
  const id = newId();
  try {
    db.prepare('INSERT INTO users (id, branch_id, username, display_name, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, branchId(db), username.trim().toLowerCase(), displayName.trim(), hashSecret(secret), role);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new AuthError(409, 'Username already exists');
    throw e;
  }
  return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
}

function updateUser(db, id, { displayName, role, secret, active }) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) throw new AuthError(404, 'User not found');
  const newRole = role ?? user.role;
  if (!ROLES.includes(newRole)) throw new AuthError(400, 'Unknown role');
  const kindChanged = PIN_ROLES.includes(newRole) !== PIN_ROLES.includes(user.role);
  if (kindChanged && secret === undefined) throw new AuthError(400, 'Switching between PIN and password roles needs a new PIN or password');
  let hash = user.password_hash;
  if (secret !== undefined) {
    const err = validateSecret(newRole, secret);
    if (err) throw new AuthError(400, err);
    hash = hashSecret(secret);
  }
  const newActive = active === undefined ? user.active : active ? 1 : 0;
  const losingManager = user.role === 'MANAGER' && user.active === 1 && (newRole !== 'MANAGER' || newActive === 0);
  if (losingManager && activeManagers(db) <= 1) throw new AuthError(409, 'Cannot remove the last active manager');
  db.prepare('UPDATE users SET display_name = ?, role = ?, password_hash = ?, active = ?, failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?')
    .run(String(displayName || '').trim() || user.display_name, newRole, hash, newActive, nowIso(), id);
  if (!newActive || secret !== undefined) revokeAllForUser(db, id);   // old logins stop working
  return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
}

const listUsers = (db) => db.prepare('SELECT id, username, display_name AS displayName, role, active, created_at FROM users ORDER BY display_name').all();
const listStaffForLogin = (db) => db.prepare(
  "SELECT id, display_name AS displayName, role FROM users WHERE active = 1 AND role IN ('WAITER','CASHIER','KDS') ORDER BY display_name").all();

// ---- login, with lockout after repeated wrong attempts ----
function authenticate(db, { userId, username, secret }) {
  const user = userId
    ? db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(userId)
    : db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(String(username || '').trim().toLowerCase());
  if (!user) { hashSecret(String(secret ?? '')); throw new AuthError(401, 'Invalid credentials'); }  // similar timing
  if (user.locked_until && user.locked_until > nowIso()) throw new AuthError(423, 'Too many wrong attempts. Try again in a minute.');
  if (!checkSecret(String(secret ?? ''), user.password_hash)) {
    const fails = user.failed_attempts + 1;
    if (fails >= MAX_FAILS) {
      db.prepare('UPDATE users SET failed_attempts = 0, locked_until = ? WHERE id = ?').run(new Date(Date.now() + LOCK_MS).toISOString(), user.id);
    } else {
      db.prepare('UPDATE users SET failed_attempts = ? WHERE id = ?').run(fails, user.id);
    }
    throw new AuthError(401, 'Invalid credentials');
  }
  db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);
  return user;
}

// For voids: a cashier or manager types their own PIN/password to approve. Use the result as approved_by.
function authenticateApprover(db, creds) {
  const user = authenticate(db, creds);
  if (!APPROVER_ROLES.includes(user.role)) throw new AuthError(403, 'Approval must come from a cashier or manager');
  return user;
}

// ---- sessions: random token; only its hash is stored; valid until logout or revoke ----
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

function startSession(db, user, device = '') {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO auth_sessions (id, user_id, token_hash, device) VALUES (?, ?, ?, ?)')
    .run(newId(), user.id, hashToken(token), String(device).slice(0, 100));
  return token;
}
function sessionUser(db, token) {
  if (!token || typeof token !== 'string') return null;
  const row = db.prepare(`SELECT u.id, u.username, u.display_name, u.role, s.id AS session_id, s.last_seen_at
    FROM auth_sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND u.active = 1`).get(hashToken(token));
  if (!row) return null;
  if (Date.now() - Date.parse(row.last_seen_at) > 60 * 1000)
    db.prepare('UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?').run(nowIso(), row.session_id);
  return publicUser(row);
}
const revokeSession = (db, token) =>
  db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').run(nowIso(), hashToken(token));
const revokeAllForUser = (db, userId) =>
  db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(nowIso(), userId);

// ---- Express / Socket.IO guards ----
const bearer = (req) => { const h = req.get('authorization') || ''; return h.startsWith('Bearer ') ? h.slice(7) : null; };
const requireAuth = (db) => (req, res, next) => {
  const user = sessionUser(db, bearer(req));
  if (!user) return res.status(401).json({ error: 'Not logged in' });
  req.user = user; req.token = bearer(req); next();
};
const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Not allowed for your role' });
const socketAuth = (db) => (socket, next) => {
  const user = sessionUser(db, socket.handshake.auth && socket.handshake.auth.token);
  if (!user) return next(new Error('unauthorized'));
  socket.user = user; next();
};

module.exports = {
  AuthError, PIN_ROLES, ROLES, userCount, createUser, updateUser, listUsers, listStaffForLogin,
  authenticate, authenticateApprover, startSession, sessionUser, revokeSession, revokeAllForUser,
  requireAuth, requireRole, socketAuth,
};
