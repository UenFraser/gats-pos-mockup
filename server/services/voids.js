const { branchId, newId, nowIso } = require('../db');
const { HttpError } = require('./errors');
const { approve } = require('./approval');
const { notify } = require('./notifications');
const { shiftOf } = require('./businessTime');
const { queue } = require('./outbox');

const MAX_QTY = 99;

function validate(body) {
  if (!body || typeof body.orderItemId !== 'string') throw new HttpError(400, 'Choose an item to void');
  if (!Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > MAX_QTY) throw new HttpError(400, `Quantity must be 1 to ${MAX_QTY}`);
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : '';
  if (!reason) throw new HttpError(400, 'Give a reason for the void');
  return { orderItemId: body.orderItemId, quantity: body.quantity, reason, approvalPin: body.approvalPin };
}

// A void is a NEW row; the order item itself is never edited. The price is read from the item, never from the client.
// user = who is asking (from the login token); the approver is whoever owns the PIN that was typed.
function voidItem(db, rt, user, sessionId, body) {
  const v = validate(body);
  return rt.transaction(db, () => {
    const row = db.prepare(`
      SELECT oi.id, oi.item_name, oi.unit_price_cents, n.net_quantity,
             b.status AS batch_status, s.status AS session_status, s.id AS session_id, t.token_number, c.kitchen
        FROM order_items oi
        JOIN order_batches b ON b.id = oi.batch_id
        JOIN sessions s ON s.id = b.session_id
        JOIN tokens t ON t.id = s.token_id
        JOIN menu_items m ON m.id = oi.menu_item_id
        JOIN categories c ON c.id = m.category_id
        JOIN v_order_items_net n ON n.id = oi.id
       WHERE oi.id = ? AND s.id = ? AND s.branch_id = ?`).get(v.orderItemId, sessionId, branchId(db));
    if (!row) throw new HttpError(404, 'Item not found on this tab');
    if (row.session_status !== 'OPEN') throw new HttpError(409, 'This tab is already closed');
    if (v.quantity > row.net_quantity) throw new HttpError(422, row.net_quantity > 0 ? `Only ${row.net_quantity} left to void` : 'This item is already fully voided');

    const approver = approve(db, user, v.approvalPin); // throws on a wrong PIN: nothing has been written yet

    const id = newId();
    const now = nowIso();
    const amount = v.quantity * row.unit_price_cents;
    db.prepare(`INSERT INTO voids (id, branch_id, order_item_id, quantity, amount_cents, reason, shift, voided_by, approved_by, voided_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, branchId(db), row.id, v.quantity, amount, v.reason, shiftOf(new Date(now)), user.id, approver.id, now);
    queue(db, 'void', 'voids', id, 'insert');

    notify(db, rt, {
      sessionId, tokenNumber: row.token_number, actor: user, type: 'VOID',
      summary: `${v.quantity}x ${row.item_name} (${v.reason}), approved by ${approver.displayName}`,
    });

    // The kitchen only hears about food it is still working on.
    const rooms = ['role:cashier', 'role:waiter'];
    if (row.kitchen && row.batch_status === 'ACTIVE') rooms.push('role:kitchen');
    rt.emitAfterCommit(rooms, 'order:voided', { sessionId, tokenNumber: row.token_number, itemId: row.id, quantity: v.quantity });
    rt.emitAfterCommit(['role:cashier', 'role:waiter'], 'session:updated', { sessionId, reason: 'void' });

    return { success: true, voidId: id, amountCents: amount, approvedBy: approver.displayName };
  });
}

function listVoids(db, sessionId) {
  return db.prepare(`
    SELECT v.id, v.quantity, v.amount_cents, v.reason, v.shift, v.voided_at, oi.item_name,
           u1.display_name AS voided_by, u2.display_name AS approved_by
      FROM voids v
      JOIN order_items oi ON oi.id = v.order_item_id
      JOIN order_batches b ON b.id = oi.batch_id
      JOIN users u1 ON u1.id = v.voided_by
      LEFT JOIN users u2 ON u2.id = v.approved_by
     WHERE b.session_id = ?
     ORDER BY v.voided_at, v.rowid`).all(sessionId).map((r) => ({
    id: r.id, item: r.item_name, quantity: r.quantity, amountCents: r.amount_cents, reason: r.reason,
    shift: r.shift, at: r.voided_at, voidedBy: r.voided_by, approvedBy: r.approved_by,
  }));
}

module.exports = { voidItem, listVoids };
