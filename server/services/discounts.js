const { branchId, newId, nowIso } = require('../db');
const { HttpError } = require('./errors');
const { approve } = require('./approval');
const { activeDiscount } = require('./totals');
const { queue } = require('./outbox');

const KINDS = ['SENIOR', 'PWD', 'PERCENT', 'AMOUNT'];
const MAX_AMOUNT = 10000000;

const text = (v, max, label, required = true) => {
  const t = typeof v === 'string' ? v.trim() : '';
  if (required && !t) throw new HttpError(400, `${label} is required`);
  if (t.length > max) throw new HttpError(400, `${label} is too long`);
  return t || null;
};

function validate(b) {
  if (!b || !KINDS.includes(b.kind)) throw new HttpError(400, 'Choose a discount type');
  const out = { kind: b.kind, percentBps: null, amountCents: null, idNumber: null, customerName: null, reason: '' };
  if (b.kind === 'SENIOR' || b.kind === 'PWD') {
    out.percentBps = 2000;
    out.customerName = text(b.customerName, 60, 'The customer name');
    out.idNumber = text(b.idNumber, 40, 'The ID number');
    out.reason = b.kind === 'SENIOR' ? 'Senior citizen' : 'Person with disability';
  } else if (b.kind === 'PERCENT') {
    const p = Number(b.percent);
    if (!(p > 0 && p <= 100)) throw new HttpError(400, 'Percent must be more than 0 and at most 100');
    out.percentBps = Math.round(p * 100);
    out.reason = text(b.reason, 200, 'A reason');
  } else {
    if (!Number.isInteger(b.amountCents) || b.amountCents < 1 || b.amountCents > MAX_AMOUNT) throw new HttpError(400, 'Enter a valid discount amount');
    out.amountCents = b.amountCents;
    out.reason = text(b.reason, 200, 'A reason');
  }
  return out;
}

function openSession(db, sessionId) {
  const s = db.prepare('SELECT id, status FROM sessions WHERE id = ? AND branch_id = ?').get(sessionId, branchId(db));
  if (!s) throw new HttpError(404, 'Tab not found');
  if (s.status !== 'OPEN') throw new HttpError(409, 'This tab is not open');
  return s;
}

// One discount per tab. Like a void, a manager or the Lead Cashier must type their approval PIN.
function applyDiscount(db, rt, user, sessionId, body) {
  const v = validate(body);
  return rt.transaction(db, () => {
    openSession(db, sessionId);
    if (activeDiscount(db, sessionId)) throw new HttpError(409, 'This tab already has a discount. Remove it first.');
    const approver = approve(db, user, body.approvalPin);
    const id = newId();
    db.prepare(`INSERT INTO session_discounts (id, branch_id, session_id, kind, percent_bps, amount_cents, reason, id_number, customer_name, applied_by, approved_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, branchId(db), sessionId, v.kind, v.percentBps, v.amountCents, v.reason, v.idNumber, v.customerName, user.id, approver.id, nowIso());
    queue(db, 'session_discount', 'session_discounts', id, 'insert');
    rt.emitAfterCommit(['role:cashier', 'role:waiter'], 'session:updated', { sessionId, reason: 'discount' });
    return { success: true, approvedBy: approver.displayName };
  });
}

function removeDiscount(db, rt, user, sessionId, body) {
  return rt.transaction(db, () => {
    openSession(db, sessionId);
    const d = activeDiscount(db, sessionId);
    if (!d) throw new HttpError(404, 'This tab has no discount');
    const approver = approve(db, user, body && body.approvalPin);
    db.prepare('UPDATE session_discounts SET removed_at = ?, removed_by = ?, removal_approved_by = ? WHERE id = ?')
      .run(nowIso(), user.id, approver.id, d.id);
    queue(db, 'session_discount', 'session_discounts', d.id, 'update');
    rt.emitAfterCommit(['role:cashier', 'role:waiter'], 'session:updated', { sessionId, reason: 'discount' });
    return { success: true };
  });
}

module.exports = { applyDiscount, removeDiscount };
