// Swap = moving food that landed on the wrong table. It is NOT a void: nothing is wasted, so it must not
// appear in void reports. The moved quantity is recorded as a transfer; the destination gets a new order item
// with the same quoted price. v_order_items_net now also subtracts transfers out and exposes each part separately.
const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";

exports.up = (db) => db.exec(`
CREATE TABLE item_transfers (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  from_item_id TEXT NOT NULL REFERENCES order_items(id),
  to_item_id TEXT NOT NULL REFERENCES order_items(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  from_session_id TEXT NOT NULL REFERENCES sessions(id),
  to_session_id TEXT NOT NULL REFERENCES sessions(id),
  moved_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX ix_transfers_from ON item_transfers(from_item_id);
CREATE INDEX ix_transfers_to ON item_transfers(to_item_id);

DROP VIEW v_order_items_net;
CREATE VIEW v_order_items_net AS
SELECT oi.*,
  COALESCE((SELECT SUM(v.quantity) FROM voids v WHERE v.order_item_id = oi.id), 0) AS voided_quantity,
  COALESCE((SELECT SUM(t.quantity) FROM item_transfers t WHERE t.from_item_id = oi.id), 0) AS moved_quantity,
  oi.quantity
    - COALESCE((SELECT SUM(v.quantity) FROM voids v WHERE v.order_item_id = oi.id), 0)
    - COALESCE((SELECT SUM(t.quantity) FROM item_transfers t WHERE t.from_item_id = oi.id), 0) AS net_quantity,
  (oi.quantity
    - COALESCE((SELECT SUM(v.quantity) FROM voids v WHERE v.order_item_id = oi.id), 0)
    - COALESCE((SELECT SUM(t.quantity) FROM item_transfers t WHERE t.from_item_id = oi.id), 0)) * oi.unit_price_cents AS net_amount_cents
FROM order_items oi;
`);
