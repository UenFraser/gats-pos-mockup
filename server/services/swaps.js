const { branchId, newId, nowIso } = require('../db');
const { HttpError } = require('./errors');
const { notify } = require('./notifications');
const { businessDate } = require('./businessTime');
const { queue } = require('./outbox');

const MAX_QTY = 99;

function validate(body) {
  if (!body || typeof body.orderItemId !== 'string') throw new HttpError(400, 'Choose an item to move');
  if (typeof body.toTokenId !== 'string') throw new HttpError(400, 'Choose the table to move it to');
  if (!Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > MAX_QTY) throw new HttpError(400, `Quantity must be 1 to ${MAX_QTY}`);
  return body;
}

// Move `quantity` of an already-ordered item from this tab to another token (the waiter picked the wrong table).
// Not a void: the source is reduced by a transfer row, the destination gets a new order item with the SAME quoted price.
// If the kitchen is still cooking it, the kitchen sees the move; if it is already done, the new item is already done.
function swapItem(db, rt, user, sessionId, body) {
  const v = validate(body);
  return rt.transaction(db, () => {
    const src = db.prepare(`
      SELECT oi.id, oi.menu_item_id, oi.item_name, oi.unit_price_cents, oi.notes, n.net_quantity,
             b.id AS batch_id, b.status AS batch_status, b.created_at AS batch_created_at, b.done_at, b.done_by,
             s.id AS session_id, s.status AS session_status, s.token_id, t.token_number, c.kitchen, c.bar_only
        FROM order_items oi
        JOIN order_batches b ON b.id = oi.batch_id
        JOIN sessions s ON s.id = b.session_id
        JOIN tokens t ON t.id = s.token_id
        JOIN menu_items m ON m.id = oi.menu_item_id
        JOIN categories c ON c.id = m.category_id
        JOIN v_order_items_net n ON n.id = oi.id
       WHERE oi.id = ? AND s.id = ? AND s.branch_id = ?`).get(v.orderItemId, sessionId, branchId(db));
    if (!src) throw new HttpError(404, 'Item not found on this tab');
    if (src.session_status !== 'OPEN') throw new HttpError(409, 'This tab is already closed');
    if (v.quantity > src.net_quantity) throw new HttpError(422, src.net_quantity > 0 ? `Only ${src.net_quantity} left to move` : 'This item is no longer on this tab');

    const dest = db.prepare('SELECT id, token_number, zone FROM tokens WHERE id = ? AND branch_id = ?').get(v.toTokenId, branchId(db));
    if (!dest) throw new HttpError(404, 'Unknown table');
    if (dest.id === src.token_id) throw new HttpError(422, 'Choose a different table');
    if (src.bar_only && dest.zone !== 'BAR') throw new HttpError(422, `${src.item_name} can only be served at the bar`);

    const now = nowIso();
    let session = db.prepare("SELECT id, status FROM sessions WHERE token_id = ? AND status IN ('RESERVED','OPEN')").get(dest.id);
    let opened = false;
    let seated = false;
    if (!session) {
      if (dest.zone === 'TAKEOUT') throw new HttpError(422, 'Start the takeout order first (it needs the customer name), then move the item');
      const id = newId();
      db.prepare("INSERT INTO sessions (id, branch_id, token_id, status, business_date, opened_by) VALUES (?, ?, ?, 'OPEN', ?, ?)")
        .run(id, branchId(db), dest.id, businessDate(new Date(now)), user.id);
      session = { id };
      opened = true;
      queue(db, 'session', 'sessions', id, 'insert');
    } else {
      seated = session.status === 'RESERVED';
      db.prepare("UPDATE sessions SET business_date = CASE WHEN status = 'RESERVED' THEN ? ELSE business_date END, status = 'OPEN', updated_at = ? WHERE id = ?")
        .run(businessDate(new Date(now)), now, session.id);
      queue(db, 'session', 'sessions', session.id, 'update');
    }

    // New batch on the destination. It keeps the ORIGINAL order time (so the kitchen sees how long it has really
    // been waiting) and the original kitchen state (already done stays done: nobody cooks it twice).
    const done = src.batch_status === 'DONE';
    const batchId = newId();
    db.prepare("INSERT INTO order_batches (id, branch_id, session_id, user_id, status, created_at, done_at, done_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(batchId, branchId(db), session.id, user.id, done ? 'DONE' : 'ACTIVE', src.batch_created_at, done ? src.done_at : null, done ? src.done_by : null);
    queue(db, 'order_batch', 'order_batches', batchId, 'insert');

    const toItemId = newId();
    db.prepare(`INSERT INTO order_items (id, branch_id, batch_id, menu_item_id, item_name, unit_price_cents, quantity, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(toItemId, branchId(db), batchId, src.menu_item_id, src.item_name, src.unit_price_cents, v.quantity, src.notes);
    queue(db, 'order_item', 'order_items', toItemId, 'insert');

    const transferId = newId();
    db.prepare(`INSERT INTO item_transfers (id, branch_id, from_item_id, to_item_id, quantity, from_session_id, to_session_id, moved_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(transferId, branchId(db), src.id, toItemId, v.quantity, sessionId, session.id, user.id, now);
    queue(db, 'item_transfer', 'item_transfers', transferId, 'insert');

    // Blue notification on BOTH tabs, so each side sees exactly what happened.
    notify(db, rt, { sessionId, tokenNumber: src.token_number, actor: user, type: 'SWAP',
      summary: `Moved ${v.quantity}x ${src.item_name} to ${dest.token_number}` });
    notify(db, rt, { sessionId: session.id, tokenNumber: dest.token_number, actor: user, type: 'SWAP',
      summary: `Moved here from ${src.token_number}: ${v.quantity}x ${src.item_name}` });

    const rooms = ['role:cashier', 'role:waiter'];
    if (src.kitchen && !done) rooms.push('role:kitchen'); // the kitchen only cares while the food is still being made
    rt.emitAfterCommit(rooms, 'order:swapped', {
      fromSessionId: sessionId, toSessionId: session.id, fromTokenNumber: src.token_number,
      toTokenNumber: dest.token_number, itemName: src.item_name, quantity: v.quantity,
    });
    rt.emitAfterCommit(['role:cashier', 'role:waiter'], 'session:updated', { sessionId, reason: 'swap' });
    rt.emitAfterCommit(['role:cashier', 'role:waiter'], 'session:updated', { sessionId: session.id, reason: 'swap' });
    if (opened || seated) rt.emitAfterCommit('all', 'token:changed', { tokenId: dest.id, status: 'OPEN', sessionId: session.id });
    if (seated) rt.emitAfterCommit('all', 'reservation:changed', { id: session.id });

    return { success: true, toSessionId: session.id, toTokenNumber: dest.token_number, transferId };
  });
}

module.exports = { swapItem };
