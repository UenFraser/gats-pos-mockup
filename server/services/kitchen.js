const { branchId, nowIso } = require('../db');
const { queue } = require('./outbox');
const { MOVED_TO_SQL, SWAPPED_FROM_SQL } = require('./itemSql');

class KitchenError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Kitchen cards show only items whose category has kitchen = 1, for tables that are still open.
const HAS_KITCHEN_ITEM = `EXISTS (SELECT 1 FROM order_items oi
                                   JOIN menu_items m ON m.id = oi.menu_item_id
                                   JOIN categories c ON c.id = m.category_id
                                  WHERE oi.batch_id = b.id AND c.kitchen = 1)`;

function listOrders(db, status) {
  const st = status === 'done' ? 'DONE' : 'ACTIVE';
  // Oldest first for active orders (nothing gets buried); most recently finished first for history.
  const order = st === 'ACTIVE' ? 'b.created_at ASC' : 'b.done_at DESC LIMIT 100';
  const batches = db.prepare(`
    SELECT b.id, b.session_id, b.created_at, b.done_at, b.recalled_at, u.display_name AS staff, t.token_number, t.zone
      FROM order_batches b
      JOIN sessions s ON s.id = b.session_id
      JOIN tokens t ON t.id = s.token_id
      JOIN users u ON u.id = b.user_id
     WHERE b.status = ? AND s.status = 'OPEN' AND s.branch_id = ? AND ${HAS_KITCHEN_ITEM}
     ORDER BY ${order}`).all(st, branchId(db));

  const itemsOf = db.prepare(`
    SELECT n.id, n.item_name, n.quantity, n.net_quantity, n.notes, n.voided_quantity, n.moved_quantity,
           ${MOVED_TO_SQL} AS moved_to, ${SWAPPED_FROM_SQL} AS swapped_from
      FROM order_items oi
      JOIN v_order_items_net n ON n.id = oi.id
      JOIN menu_items m ON m.id = oi.menu_item_id
      JOIN categories c ON c.id = m.category_id
     WHERE oi.batch_id = ? AND c.kitchen = 1
     ORDER BY oi.rowid`);

  return batches.map((b) => ({
    id: b.id, sessionId: b.session_id, tokenNumber: b.token_number, zone: b.zone, staff: b.staff,
    createdAt: b.created_at, doneAt: b.done_at, recalledAt: b.recalled_at,
    items: itemsOf.all(b.id).map((i) => ({
      id: i.id, name: i.item_name, quantity: i.quantity, netQuantity: i.net_quantity,
      voidedQuantity: i.voided_quantity, movedQuantity: i.moved_quantity,
      movedTo: i.moved_to ? i.moved_to.split(',') : [], swappedFrom: i.swapped_from || null, notes: i.notes,
    })),
  }));
}

function findBatch(db, id) {
  return db.prepare(`
    SELECT b.id, b.status, b.session_id, t.token_number
      FROM order_batches b JOIN sessions s ON s.id = b.session_id JOIN tokens t ON t.id = s.token_id
     WHERE b.id = ? AND s.status = 'OPEN' AND s.branch_id = ?`).get(id, branchId(db));
}

function markDone(db, rt, user, batchId) {
  return rt.transaction(db, () => {
    const b = findBatch(db, batchId);
    if (!b) throw new KitchenError(404, 'Order not found (its table may already be closed)');
    if (b.status === 'DONE') return { success: true, already: true };
    if (b.status !== 'ACTIVE') throw new KitchenError(409, 'This order was cancelled');
    db.prepare("UPDATE order_batches SET status = 'DONE', done_at = ?, done_by = ? WHERE id = ?").run(nowIso(), user.id, batchId);
    queue(db, 'order_batch', 'order_batches', batchId, 'update');
    rt.emitAfterCommit(['role:kitchen', 'role:waiter'], 'kitchen:order-done',
      { batchId, sessionId: b.session_id, tokenNumber: b.token_number });
    return { success: true };
  });
}

function recall(db, rt, user, batchId) {
  return rt.transaction(db, () => {
    const b = findBatch(db, batchId);
    if (!b) throw new KitchenError(404, 'Order not found (its table may already be closed)');
    if (b.status === 'ACTIVE') return { success: true, already: true };
    if (b.status !== 'DONE') throw new KitchenError(409, 'This order was cancelled');
    db.prepare("UPDATE order_batches SET status = 'ACTIVE', done_at = NULL, recalled_at = ? WHERE id = ?").run(nowIso(), batchId);
    queue(db, 'order_batch', 'order_batches', batchId, 'update');
    rt.emitAfterCommit(['role:kitchen', 'role:waiter'], 'kitchen:order-recalled',
      { batchId, sessionId: b.session_id, tokenNumber: b.token_number });
    return { success: true };
  });
}

// A waiter or cashier nudges the kitchen about ONE food item. Only the kitchen screen hears it.
function followUpFood(db, rt, orderItemId) {
  if (typeof orderItemId !== 'string') throw new KitchenError(400, 'Choose an item');
  const r = db.prepare(`
    SELECT oi.id, oi.item_name, oi.batch_id, b.session_id, b.status AS batch_status, s.status AS session_status,
           t.token_number, c.kitchen, n.net_quantity
      FROM order_items oi
      JOIN order_batches b ON b.id = oi.batch_id
      JOIN sessions s ON s.id = b.session_id
      JOIN tokens t ON t.id = s.token_id
      JOIN menu_items m ON m.id = oi.menu_item_id
      JOIN categories c ON c.id = m.category_id
      JOIN v_order_items_net n ON n.id = oi.id
     WHERE oi.id = ? AND s.branch_id = ?`).get(orderItemId, branchId(db));
  if (!r) throw new KitchenError(404, 'Item not found');
  if (r.session_status !== 'OPEN') throw new KitchenError(409, 'This table is already closed');
  if (!r.kitchen) throw new KitchenError(422, 'Only food items can be followed up');
  if (r.net_quantity <= 0) throw new KitchenError(409, 'This item is no longer on this tab');
  if (r.batch_status !== 'ACTIVE') throw new KitchenError(409, 'The kitchen already marked this order done');
  rt.emitAfterCommit('role:kitchen', 'followup:food', {
    itemId: r.id, batchId: r.batch_id, sessionId: r.session_id, tokenNumber: r.token_number, name: r.item_name,
  });
  return { success: true, itemId: r.id };
}

module.exports = { KitchenError, listOrders, markDone, recall, followUpFood };
