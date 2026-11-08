const { branchId } = require('../db');
const { unreadCounts, listUnread } = require('./notifications');
const { MOVED_TO_SQL, SWAPPED_FROM_SQL } = require('./itemSql');
const { billOf } = require('./totals');

// Money comes from v_order_items_net (migration 001): quantity minus voids, times the price copied at order time.
// audience = 'CASHIER' or 'WAITER': whose unread notifications to count (see notifications.js)
function listOpenSessions(db, audience) {
  const counts = unreadCounts(db, audience);
  return db.prepare(`
    SELECT s.id, s.token_id, t.token_number, t.zone, s.status, s.created_at, s.bill_requested_at,
           u.display_name AS opened_by_name,
           COALESCE((SELECT SUM(n.net_amount_cents) FROM order_batches b JOIN v_order_items_net n ON n.batch_id = b.id
                      WHERE b.session_id = s.id AND b.status != 'CANCELLED'), 0) AS total_cents,
           COALESCE((SELECT SUM(n.net_quantity) FROM order_batches b JOIN v_order_items_net n ON n.batch_id = b.id
                      WHERE b.session_id = s.id AND b.status != 'CANCELLED'), 0) AS item_count
      FROM sessions s
      JOIN tokens t ON t.id = s.token_id
      LEFT JOIN users u ON u.id = s.opened_by
     WHERE s.status = 'OPEN' AND s.branch_id = ?
     ORDER BY s.created_at`).all(branchId(db)).map((r) => ({
    id: r.id, tokenId: r.token_id, tokenNumber: r.token_number, zone: r.zone, status: r.status,
    openedAt: r.created_at, openedBy: r.opened_by_name, billRequestedAt: r.bill_requested_at, unread: counts.get(r.id) || {},
    totalCents: r.total_cents, itemCount: r.item_count,
  }));
}

function getSession(db, id, audience) {
  const s = db.prepare(`
    SELECT s.*, t.token_number, t.zone FROM sessions s JOIN tokens t ON t.id = s.token_id
     WHERE s.id = ? AND s.branch_id = ?`).get(id, branchId(db));
  if (!s) return null;

  const rows = db.prepare(`
    SELECT b.id AS batch_id, b.created_at, b.status AS batch_status, u.display_name AS staff,
           n.id AS item_id, n.item_name, n.unit_price_cents, n.quantity, n.net_quantity, n.notes, c.kitchen, c.bar_only,
           n.voided_quantity, n.moved_quantity, ${MOVED_TO_SQL} AS moved_to, ${SWAPPED_FROM_SQL} AS swapped_from
      FROM order_batches b
      JOIN users u ON u.id = b.user_id
      LEFT JOIN order_items oi ON oi.batch_id = b.id          -- oi.rowid keeps the order items were entered in
      LEFT JOIN v_order_items_net n ON n.id = oi.id
      LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
      LEFT JOIN categories c ON c.id = mi.category_id
     WHERE b.session_id = ?
     ORDER BY b.created_at, oi.rowid`).all(id);

  const batches = [];
  const byId = new Map();
  let totalCents = 0;
  for (const r of rows) {
    if (!byId.has(r.batch_id)) {
      const b = { id: r.batch_id, createdAt: r.created_at, status: r.batch_status, staff: r.staff, items: [] };
      byId.set(r.batch_id, b); batches.push(b);
    }
    if (r.item_id) {
      byId.get(r.batch_id).items.push({
        id: r.item_id, name: r.item_name, unitPriceCents: r.unit_price_cents,
        quantity: r.quantity, notes: r.notes, kitchen: !!r.kitchen, barOnly: !!r.bar_only,
        netQuantity: r.net_quantity, voidedQuantity: r.voided_quantity, movedQuantity: r.moved_quantity,
        movedTo: r.moved_to ? r.moved_to.split(',') : [], swappedFrom: r.swapped_from || null,
      });
      if (r.batch_status !== 'CANCELLED') totalCents += r.net_quantity * r.unit_price_cents;
    }
  }
  const bill = billOf(db, id);
  return {
    id: s.id, tokenId: s.token_id, tokenNumber: s.token_number, zone: s.zone, status: s.status,
    businessDate: s.business_date, openedAt: s.created_at,
    reservationName: s.reservation_name, reservationFeeCents: s.reservation_fee_cents,
    billRequestedAt: s.bill_requested_at,
    billRequestedBy: s.bill_requested_by
      ? db.prepare('SELECT display_name FROM users WHERE id = ?').pluck().get(s.bill_requested_by) : null,
    notifications: listUnread(db, id, audience), // unread for the viewer; the screen shows them, then marks them read
    totalCents, bill, discount: bill.discount, batches,
  };
}

module.exports = { listOpenSessions, getSession };
