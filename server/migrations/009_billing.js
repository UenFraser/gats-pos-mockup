// 1) Token letters: R = restaurant, T = takeout (they were the other way around). Done in four steps through
//    temporary letters because (branch, token_number) must stay unique. Token ids never change, so every
//    existing tab and sale stays attached to the same physical token.
// 2) Discounts (one active per tab, always approved with a PIN) and a frozen copy of the bill on closed tabs,
//    so a reprint or a report never changes when VAT or fee settings change later.
const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";

exports.up = (db) => db.exec(`
UPDATE tokens SET token_number = 'Q' || substr(token_number, 2) WHERE zone = 'RESTAURANT' AND token_number LIKE 'T%';
UPDATE tokens SET token_number = 'W' || substr(token_number, 2) WHERE zone = 'TAKEOUT' AND token_number LIKE 'R%';
UPDATE tokens SET token_number = 'R' || substr(token_number, 2) WHERE zone = 'RESTAURANT' AND token_number LIKE 'Q%';
UPDATE tokens SET token_number = 'T' || substr(token_number, 2) WHERE zone = 'TAKEOUT' AND token_number LIKE 'W%';

CREATE TABLE session_discounts (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  kind TEXT NOT NULL CHECK (kind IN ('SENIOR','PWD','PERCENT','AMOUNT')),
  percent_bps INTEGER,                 -- 2000 = 20%  (SENIOR, PWD, PERCENT)
  amount_cents INTEGER,                -- AMOUNT
  reason TEXT NOT NULL,
  id_number TEXT,                      -- Senior / PWD ID
  customer_name TEXT,
  applied_by TEXT NOT NULL REFERENCES users(id),
  approved_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT ${NOW},
  removed_at TEXT,
  removed_by TEXT REFERENCES users(id),
  removal_approved_by TEXT REFERENCES users(id)
);
CREATE UNIQUE INDEX ux_discount_active ON session_discounts(session_id) WHERE removed_at IS NULL;

ALTER TABLE sessions ADD COLUMN subtotal_cents INTEGER;
ALTER TABLE sessions ADD COLUMN discount_cents INTEGER;
ALTER TABLE sessions ADD COLUMN fee_cents INTEGER;
ALTER TABLE sessions ADD COLUMN vat_cents INTEGER;
ALTER TABLE sessions ADD COLUMN vatable_sales_cents INTEGER;
ALTER TABLE sessions ADD COLUMN vat_exempt_sales_cents INTEGER;
ALTER TABLE sessions ADD COLUMN bill_json TEXT;
`);
