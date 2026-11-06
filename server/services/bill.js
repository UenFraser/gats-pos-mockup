const { branchId, nowIso } = require('../db');
const { HttpError } = require('./errors');
const { queue } = require('./outbox');

function load(db, sessionId) {
  const s = db.prepare(`SELECT s.id, s.status, s.bill_requested_at, t.token_number
                          FROM sessions s JOIN tokens t ON t.id = s.token_id
                         WHERE s.id = ? AND s.branch_id = ?`).get(sessionId, branchId(db));
  if (!s) throw new HttpError(404, 'Tab not found');
  if (s.status !== 'OPEN') throw new HttpError(409, 'This tab is not open');
  return s;
}

// Waiter (or cashier) asks for the bill. Stays until the cashier handles it (or the tab is closed).
function requestBill(db, rt, user, sessionId) {
  return rt.transaction(db, () => {
    const s = load(db, sessionId);
    if (s.bill_requested_at) return { success: true, already: true };
    db.prepare('UPDATE sessions SET bill_requested_at = ?, bill_requested_by = ?, updated_at = ? WHERE id = ?')
      .run(nowIso(), user.id, nowIso(), sessionId);
    queue(db, 'session', 'sessions', sessionId, 'update');
    rt.emitAfterCommit('role:cashier', 'session:bill-requested', { sessionId, tokenNumber: s.token_number, by: user.displayName });
    rt.emitAfterCommit(['role:cashier', 'role:waiter'], 'session:updated', { sessionId, reason: 'bill' });
    return { success: true };
  });
}

function clearBill(db, rt, user, sessionId) {
  return rt.transaction(db, () => {
    const s = load(db, sessionId);
    if (!s.bill_requested_at) return { success: true, already: true };
    db.prepare('UPDATE sessions SET bill_requested_at = NULL, bill_requested_by = NULL, updated_at = ? WHERE id = ?')
      .run(nowIso(), sessionId);
    queue(db, 'session', 'sessions', sessionId, 'update');
    rt.emitAfterCommit(['role:cashier', 'role:waiter'], 'session:bill-cleared', { sessionId, tokenNumber: s.token_number });
    rt.emitAfterCommit(['role:cashier', 'role:waiter'], 'session:updated', { sessionId, reason: 'bill' });
    return { success: true };
  });
}

module.exports = { requestBill, clearBill };
