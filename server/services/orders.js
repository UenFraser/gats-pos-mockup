const { branchId, newId, nowIso } = require('../db');
const { getOrderableItem } = require('./menu');
const { businessDate } = require('./businessTime');
const { queue } = require('./outbox');
const { notify } = require('./notifications');
const { parseTakeout } = require('./takeouts');

class OrderError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const MAX_LINES = 40;
const MAX_QTY = 99;

// A phone on bad Wi-Fi may resend the same order. Remember recent request ids so it is saved only once.
const recent = new Map();
const KEEP_MS = 10 * 60 * 1000;
function remember(key, result) {
  const now = Date.now();
  for (const [k, v] of recent) if (now - v.at > KEEP_MS) recent.delete(k);
  recent.set(key, { at: now, result });
}

function validate(body) {
  if (!body || typeof body.tokenId !== 'string') throw new OrderError(400, 'Choose a token first');
  if (!Array.isArray(body.items) || body.items.length === 0) throw new OrderError(400, 'The order has no items');
  if (body.items.length > MAX_LINES) throw new OrderError(400, `Too many lines (max ${MAX_LINES})`);
  const requestId = typeof body.requestId === 'string' && body.requestId.length >= 8 && body.requestId.length <= 64
    ? body.requestId : null;
  // Only ids, quantities and notes are read. Any price or staff name sent by the client is ignored.
  const lines = body.items.map((l) => {
    if (!l || typeof l.menuItemId !== 'string') throw new OrderError(400, 'Bad item in the order');
    if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > MAX_QTY)
      throw new OrderError(400, `Quantity must be 1 to ${MAX_QTY}`);
    const notes = typeof l.notes === 'string' && l.notes.trim() ? l.notes.trim().slice(0, 200) : null;
    return { menuItemId: l.menuItemId, quantity: l.quantity, notes };
  });
  const takeout = body.takeout ? parseTakeout(body.takeout) : null; // only used when a takeout tab is being opened
  return { tokenId: body.tokenId, requestId, lines, takeout };
}

// Adds ONE new batch to the token's session (opening the session if the token is free).
// `user` comes from the login token. Prices and names come from the menu table.
function placeOrder(db, rt, user, body) {
  const { tokenId, requestId, lines, takeout } = validate(body);

  const dedupeKey = requestId && `${user.id}:${requestId}`;
  if (dedupeKey && recent.has(dedupeKey)) return { ...recent.get(dedupeKey).result, duplicate: true };

  const token = db.prepare('SELECT id, token_number, zone FROM tokens WHERE id = ? AND branch_id = ?').get(tokenId, branchId(db));
  if (!token) throw new OrderError(404, 'Unknown token');

  const result = rt.transaction(db, () => {
    const resolved = lines.map((l) => {
      const item = getOrderableItem(db, l.menuItemId, token.zone);
      if (!item) throw new OrderError(422, `An item is not available on ${token.token_number} (alcohol is bar-only)`);
      return { ...l, item };
    });

    const now = nowIso();
    let session = db.prepare("SELECT id, status FROM sessions WHERE token_id = ? AND status IN ('RESERVED','OPEN')").get(token.id);
    let opened = false;
    if (!session) {
      const id = newId();
      const isTakeout = token.zone === 'TAKEOUT';
      if (isTakeout && !takeout) throw new OrderError(422, 'A takeout order needs the customer name');
      db.prepare(`INSERT INTO sessions (id, branch_id, token_id, status, business_date, opened_by, customer_name, customer_phone, order_source, pickup_at)
                  VALUES (?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?)`)
        .run(id, branchId(db), token.id, businessDate(new Date(now)), user.id,
          isTakeout ? takeout.name : null, isTakeout ? takeout.phone : null, isTakeout ? takeout.source : null, isTakeout ? takeout.pickupAt : null);
      session = { id };
      opened = true;
      queue(db, 'session', 'sessions', id, 'insert');
    } else {
      // Ordering on an existing tab (a RESERVED token becomes OPEN when seated).
      // Seating a reservation: the business day becomes the day the guests actually sit down.
      db.prepare("UPDATE sessions SET business_date = CASE WHEN status = 'RESERVED' THEN ? ELSE business_date END, status = 'OPEN', updated_at = ? WHERE id = ?")
        .run(businessDate(new Date(now)), now, session.id);
      queue(db, 'session', 'sessions', session.id, 'update');
    }

    const batchId = newId();
    db.prepare("INSERT INTO order_batches (id, branch_id, session_id, user_id, status, created_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?)")
      .run(batchId, branchId(db), session.id, user.id, now);
    queue(db, 'order_batch', 'order_batches', batchId, 'insert');

    const insItem = db.prepare(`INSERT INTO order_items (id, branch_id, batch_id, menu_item_id, item_name, unit_price_cents, quantity, notes)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const r of resolved) {
      const id = newId();
      insItem.run(id, branchId(db), batchId, r.item.id, r.item.name, r.item.price_cents, r.quantity, r.notes);
      queue(db, 'order_item', 'order_items', id, 'insert');
    }

    // Tell the other side (green = items added). Saved in the same transaction as the order.
    notify(db, rt, {
      sessionId: session.id, tokenNumber: token.token_number, actor: user, type: 'ADD',
      summary: (opened ? 'New tab: ' : '') + resolved.map((r) => `${r.quantity}x ${r.item.name}`).join(', '),
    });

    // Events go out only if this whole transaction commits.
    const kitchenItems = resolved.filter((r) => r.item.kitchen);
    if (kitchenItems.length) {
      rt.emitAfterCommit('role:kitchen', 'kitchen:order-new', {
        batchId, sessionId: session.id, tokenNumber: token.token_number, zone: token.zone,
        staffName: user.displayName, createdAt: now,
        items: kitchenItems.map((r) => ({ name: r.item.name, quantity: r.quantity, notes: r.notes })),
      });
    }
    rt.emitAfterCommit(['role:cashier', 'role:waiter'], 'session:updated', {
      sessionId: session.id, tokenId: token.id, tokenNumber: token.token_number, reason: opened ? 'opened' : 'order',
    });
    if (opened) rt.emitAfterCommit('all', 'token:changed', { tokenId: token.id, status: 'OPEN', sessionId: session.id });

    return { success: true, orderId: batchId, sessionId: session.id, tokenNumber: token.token_number, sessionOpened: opened };
  });

  if (dedupeKey) remember(dedupeKey, result);
  return result;
}

module.exports = { placeOrder, OrderError };
