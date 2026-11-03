// Conventions: UUID text ids, UTC ISO timestamps, money in integer centavos,
// sales rows are never deleted or edited (voids/payments are new rows).
// App code must set updated_at on every UPDATE.
const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";

exports.up = (db) => db.exec(`
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('CASHIER','WAITER','KDS','MANAGER')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),   -- deactivate, never delete
  created_at TEXT NOT NULL DEFAULT ${NOW},
  updated_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  bar_only INTEGER NOT NULL DEFAULT 0 CHECK (bar_only IN (0,1)),
  created_at TEXT NOT NULL DEFAULT ${NOW},
  updated_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE menu_items (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  is_available INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0,1)),
  created_at TEXT NOT NULL DEFAULT ${NOW},
  updated_at TEXT NOT NULL DEFAULT ${NOW},
  UNIQUE (category_id, name)
);

-- Physical magnet tokens. Zone lives here only; "in use" is derived from open sessions.
CREATE TABLE tokens (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  token_number TEXT NOT NULL,
  zone TEXT NOT NULL CHECK (zone IN ('RESTAURANT','BAR','TAKEOUT')),
  UNIQUE (branch_id, token_number)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  token_id TEXT NOT NULL REFERENCES tokens(id),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('RESERVED','OPEN','CLOSED','CANCELLED')),
  business_date TEXT NOT NULL,                 -- YYYY-MM-DD after your closing-time cutoff
  is_new INTEGER NOT NULL DEFAULT 1,
  has_unread_update INTEGER NOT NULL DEFAULT 0,
  reservation_name TEXT,
  reservation_time TEXT,
  reservation_fee_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER,                         -- final bill, set when closed
  opened_by TEXT REFERENCES users(id),
  closed_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT ${NOW},
  updated_at TEXT NOT NULL DEFAULT ${NOW},
  closed_at TEXT
);
-- A token can have only ONE reserved/open session at a time (enforced by the database).
CREATE UNIQUE INDEX ux_sessions_active_token ON sessions(token_id) WHERE status IN ('RESERVED','OPEN');
CREATE INDEX ix_sessions_date ON sessions(business_date);

CREATE TABLE order_batches (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DONE','CANCELLED')),
  created_at TEXT NOT NULL DEFAULT ${NOW},
  done_at TEXT
);
CREATE INDEX ix_batches_session ON order_batches(session_id);

-- Name and price are copied at order time so old receipts never change.
CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  batch_id TEXT NOT NULL REFERENCES order_batches(id),
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
  item_name TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  notes TEXT
);
CREATE INDEX ix_items_batch ON order_items(batch_id);

-- Voids are new rows pointing at the item (no copying, no cascade delete).
CREATE TABLE voids (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  order_item_id TEXT NOT NULL REFERENCES order_items(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  reason TEXT NOT NULL,
  shift TEXT NOT NULL CHECK (shift IN ('AM','PM')),
  voided_by TEXT NOT NULL REFERENCES users(id),
  approved_by TEXT REFERENCES users(id),
  voided_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX ix_voids_item ON voids(order_item_id);

-- A bill can be split across several payments.
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  method TEXT NOT NULL CHECK (method IN ('CASH','CARD','GCASH','OTHER')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  tip_cents INTEGER NOT NULL DEFAULT 0 CHECK (tip_cents >= 0),
  received_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX ix_payments_session ON payments(session_id);

CREATE TABLE ice_requests (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  token_id TEXT NOT NULL REFERENCES tokens(id),   -- which table / bar spot to deliver to
  trays INTEGER NOT NULL DEFAULT 1 CHECK (trays > 0),
  status TEXT NOT NULL DEFAULT 'REQUESTED'
    CHECK (status IN ('REQUESTED','DELIVERED','CANCELLED')),
  requested_by TEXT NOT NULL REFERENCES users(id),
  delivered_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT ${NOW},
  delivered_at TEXT
);
CREATE INDEX ix_ice_pending ON ice_requests(created_at) WHERE status = 'REQUESTED';

-- Changes waiting to be sent to HQ. Write a row in the same transaction as the change.
CREATE TABLE sync_outbox (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('insert','update')),
  payload TEXT NOT NULL,                       -- JSON snapshot of the row
  created_at TEXT NOT NULL DEFAULT ${NOW},
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  synced_at TEXT
);
CREATE INDEX ix_outbox_pending ON sync_outbox(seq) WHERE synced_at IS NULL;

CREATE VIEW v_order_items_net AS
SELECT oi.*,
       oi.quantity - COALESCE(SUM(v.quantity), 0) AS net_quantity,
       (oi.quantity - COALESCE(SUM(v.quantity), 0)) * oi.unit_price_cents AS net_amount_cents
FROM order_items oi LEFT JOIN voids v ON v.order_item_id = oi.id
GROUP BY oi.id;
`);
