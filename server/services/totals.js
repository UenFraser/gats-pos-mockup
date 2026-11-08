// THE one place that decides what a tab costs. Everything (tab view, checkout, bill, receipt) reads this.
const { getBillingSettings } = require('./settings');

const mulDiv = (a, b, c) => Math.round((a * b) / c);
const STATUTORY_BPS = 2000; // Senior citizen / PWD: 20%

// Items still on the tab (not voided, not moved away) on batches that were not cancelled.
function itemsTotalCents(db, sessionId) {
  return db.prepare(`SELECT COALESCE(SUM(n.net_amount_cents), 0)
                       FROM order_batches b JOIN v_order_items_net n ON n.batch_id = b.id
                      WHERE b.session_id = ? AND b.status != 'CANCELLED'`).pluck().get(sessionId);
}

function discountLabel(d) {
  if (d.kind === 'SENIOR') return 'Senior citizen discount 20%';
  if (d.kind === 'PWD') return 'PWD discount 20%';
  if (d.kind === 'PERCENT') return `Discount ${d.percentBps / 100}%`;
  return 'Discount';
}

function activeDiscount(db, sessionId) {
  const r = db.prepare('SELECT * FROM session_discounts WHERE session_id = ? AND removed_at IS NULL').get(sessionId);
  if (!r) return null;
  const d = { id: r.id, kind: r.kind, percentBps: r.percent_bps, amountCents: r.amount_cents, reason: r.reason, idNumber: r.id_number, customerName: r.customer_name };
  return { ...d, label: discountLabel(d) };
}

// Order of calculation:
//   items
//   - (Senior/PWD with VAT on) the VAT they are exempt from, then 20% of what is left
//   - (other discounts) percent of items, or a fixed amount (never more than the items)
//   + reservation fee when feeMode is ADD
//   = total (the bill).   A prepaid fee (feeMode DEDUCT) is a credit against it:  due = total - credit.
// With VAT 'INCLUSIVE' the total is split into VATable sales + VAT (Senior/PWD part is VAT-exempt sales).
function computeBill(db, sessionId) {
  const cfg = getBillingSettings(db);
  const items = itemsTotalCents(db, sessionId);
  const fee = db.prepare('SELECT reservation_fee_cents FROM sessions WHERE id = ?').pluck().get(sessionId) || 0;
  const discount = activeDiscount(db, sessionId);
  const vatOn = cfg.vatMode === 'INCLUSIVE';
  const statutory = !!discount && (discount.kind === 'SENIOR' || discount.kind === 'PWD');

  let vatRemoved = 0;
  let disc = 0;
  if (discount) {
    if (statutory) {
      const base = vatOn ? mulDiv(items, 10000, 10000 + cfg.vatRateBps) : items;
      vatRemoved = items - base;
      disc = mulDiv(base, STATUTORY_BPS, 10000);
    } else if (discount.kind === 'PERCENT') {
      disc = mulDiv(items, discount.percentBps, 10000);
    } else {
      disc = Math.min(discount.amountCents, items);
    }
  }
  const feeCharge = cfg.feeMode === 'ADD' ? fee : 0;
  const total = items - vatRemoved - disc + feeCharge;
  const credit = cfg.feeMode === 'DEDUCT' ? Math.min(fee, total) : 0;

  let vatable = 0; let vat = 0; let exempt = 0;
  if (vatOn) {
    exempt = statutory ? items - vatRemoved - disc : 0;
    const gross = total - exempt;
    vatable = mulDiv(gross, 10000, 10000 + cfg.vatRateBps);
    vat = gross - vatable;
  }
  return {
    itemsCents: items, vatRemovedCents: vatRemoved, discountCents: disc, feeChargeCents: feeCharge,
    totalCents: total, creditCents: credit, dueCents: total - credit,
    vatMode: cfg.vatMode, vatRateBps: cfg.vatRateBps,
    vatableSalesCents: vatable, vatCents: vat, vatExemptSalesCents: exempt, discount,
  };
}

// Open tab: calculated now. Closed tab: the frozen copy saved at checkout (settings changes never rewrite history).
function billOf(db, sessionId) {
  const s = db.prepare('SELECT status, total_cents, bill_json FROM sessions WHERE id = ?').get(sessionId);
  if (s && s.status === 'CLOSED') {
    if (s.bill_json) return JSON.parse(s.bill_json);
    // Tabs closed before bills were frozen: rebuild from what was paid.
    const total = s.total_cents || 0;
    const paid = db.prepare('SELECT COALESCE(SUM(amount_cents), 0) FROM payments WHERE session_id = ?').pluck().get(sessionId);
    return {
      itemsCents: total, vatRemovedCents: 0, discountCents: 0, feeChargeCents: 0, totalCents: total,
      creditCents: Math.max(0, total - paid), dueCents: paid, vatMode: 'NONE', vatRateBps: 0,
      vatableSalesCents: 0, vatCents: 0, vatExemptSalesCents: 0, discount: null,
    };
  }
  return computeBill(db, sessionId);
}

module.exports = { itemsTotalCents, computeBill, billOf, activeDiscount };
