const { branchId, newId, nowIso } = require('../db');
const { HttpError } = require('./errors');
const { approve } = require('./approval');
const { shiftOf } = require('./businessTime');
const { pendingKitchenBatches } = require('./kitchen');
const { queue } = require('./outbox');

const SOURCES = ['LOCAL', 'ONLINE']; // LOCAL = ordered while dining in the building, ONLINE = ordered remotely (call or website)

const clean = (v, max, label, required) => {
  const t = typeof v === 'string' ? v.trim() : '';
  if (required && !t) throw new HttpError(422, `${label} is required for a takeout order`);
  if (t.length > max) throw new HttpError(400, `${label} is too long`);
  return t || null;
};

// Customer details that go with the FIRST order of a takeout tab.
function parseTakeout(t) {
  if (!t || typeof t !== 'object') throw new HttpError(422, 'A takeout order needs the customer name');
  const name = clean(t.name, 60, 'The customer name', true);
  const phone = clean(t.phone, 30, 'The phone number', false);
  if (!SOURCES.includes(t.source)) throw new HttpError(422, 'Choose local (dining in) or online');
  let pickupAt = null;
  if (t.pickupAt) {
    const ms = Date.parse(t.pickupAt);
    if (!Number.isFinite(ms) || ms < Date.now() - 6 * 3600 * 1000 || ms > Date.now() + 24 * 3600 * 1000) throw new HttpError(400, 'Pickup time must be within the next day');
    pickupAt = new Date(ms).toISOString();
  }
  return { name, phone, source: t.source, pickupAt };
}

function takeoutSession(db, sessionId) {
  const s = db.prepare(`SELECT s.id, s.status, s.token_id, t.token_number, t.zone, s.customer_name
                          FROM sessions s JOIN tokens t ON t.id = s.token_id WHERE s.id = ? AND s.branch_id = ?`).get(sessionId, branchId(db));
  if (!s) throw new HttpError(404, 'Tab not found');
  if (s.zone !== 'TAKEOUT') throw new HttpError(422, 'This is not a takeout order');
  if (s.status !== 'OPEN') throw new HttpError(409, 'This takeout is already closed');
  return s;
}

// Front of house nudges the kitchen about a whole takeout (for example, the customer has arrived). Only the kitchen hears it.
function followUpTakeout(db, rt, user, sessionId) {
  const s = takeoutSession(db, typeof sessionId === 'string' ? sessionId : '');
  if (pendingKitchenBatches(db, s.id) === 0) throw new HttpError(409, 'The kitchen already finished this order');
  rt.emitAfterCommit('role:kitchen', 'followup:takeout', { sessionId: s.id, tokenNumber: s.token_number, customerName: s.customer_name });
  return { success: true };
}

// Nobody came for it. Every item left on the tab is voided (so the waste is on record), approved with a PIN, and the tab is cancelled.
function cancelTakeout(db, rt, user, sessionId, body) {
  const reason = typeof (body && body.reason) === 'string' ? body.reason.trim().slice(0, 200) : '';
  if (!reason) throw new HttpError(400, 'Give a reason');
  return rt.transaction(db, () => {
    const s = takeoutSession(db, sessionId);
    const approver = approve(db, user, body.approvalPin);
    const now = nowIso();
    const left = db.prepare(`
      SELECT n.id, n.net_quantity, n.unit_price_cents, b.status AS batch_status, c.kitchen
        FROM order_batches b
        JOIN order_items oi ON oi.batch_id = b.id
        JOIN v_order_items_net n ON n.id = oi.id
        JOIN menu_items m ON m.id = oi.menu_item_id
        JOIN categories c ON c.id = m.category_id
       WHERE b.session_id = ? AND b.status != 'CANCELLED' AND n.net_quantity > 0`).all(sessionId);

    const ins = db.prepare(`INSERT INTO voids (id, branch_id, order_item_id, quantity, amount_cents, reason, shift, voided_by, approved_by, voided_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const it of left) {
      const id = newId();
      ins.run(id, branchId(db), it.id, it.net_quantity, it.net_quantity * it.unit_price_cents, `Takeout cancelled: ${reason}`,
        shiftOf(new Date(now)), user.id, approver.id, now);
      queue(db, 'void', 'voids', id, 'insert');
    }
    db.prepare(`UPDATE sessions SET status = 'CANCELLED', cancel_reason = ?, cancelled_by = ?, cancel_approved_by = ?,
                       total_cents = 0, closed_by = ?, closed_at = ?, bill_requested_at = NULL, bill_requested_by = NULL, updated_at = ? WHERE id = ?`)
      .run(reason, user.id, approver.id, user.id, now, now, sessionId);
    queue(db, 'session', 'sessions', sessionId, 'update');

    if (left.some((i) => i.kitchen && i.batch_status === 'ACTIVE'))
      rt.emitAfterCommit('role:kitchen', 'order:voided', { sessionId, tokenNumber: s.token_number }); // kitchen stops cooking it
    rt.emitAfterCommit('all', 'session:closed', { sessionId, tokenNumber: s.token_number, reason: 'cancelled' });
    rt.emitAfterCommit('all', 'token:changed', { tokenId: s.token_id, status: 'FREE', sessionId: null });
    return { success: true, voidedItems: left.length, approvedBy: approver.displayName };
  });
}

module.exports = { parseTakeout, followUpTakeout, cancelTakeout, SOURCES };
