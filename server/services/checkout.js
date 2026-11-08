const { branchId, newId, nowIso } = require('../db');
const { HttpError } = require('./errors');
const { computeBill } = require('./totals');
const { printDocument } = require('./printing');
const { queue } = require('./outbox');

const METHODS = ['CASH', 'CARD', 'GCASH', 'OTHER'];
const MAX_CENTS = 100000000; // PHP 1,000,000

function validatePayments(list) {
  if (!Array.isArray(list)) throw new HttpError(400, 'payments must be a list');
  if (list.length > 10) throw new HttpError(400, 'Too many payment lines');
  return list.map((p) => {
    if (!p || !METHODS.includes(p.method)) throw new HttpError(400, 'Choose a payment method (cash, card, GCash or other)');
    if (!Number.isInteger(p.amountCents) || p.amountCents < 1 || p.amountCents > MAX_CENTS) throw new HttpError(400, 'Enter a valid amount');
    return { method: p.method, amountCents: p.amountCents };
  });
}

// Work out what each payment line really pays. Cards, GCash and Other pay exactly what is typed.
// Cash is what the customer handed over; whatever exceeds the bill is change.
function settle(dueCents, lines) {
  const nonCash = lines.filter((l) => l.method !== 'CASH');
  const cash = lines.filter((l) => l.method === 'CASH');
  const nonCashTotal = nonCash.reduce((n, l) => n + l.amountCents, 0);
  if (dueCents === 0) {
    if (lines.length) throw new HttpError(422, 'Nothing is due on this tab, so no payment is needed');
    return { rows: [], changeCents: 0 };
  }
  if (!lines.length) throw new HttpError(422, 'Add a payment');
  if (nonCashTotal > dueCents) throw new HttpError(422, 'Card, GCash and other payments are more than the bill');
  const cashNeeded = dueCents - nonCashTotal;
  const cashHanded = cash.reduce((n, l) => n + l.amountCents, 0);
  if (cashNeeded === 0 && cashHanded > 0) throw new HttpError(422, 'The bill is already covered, remove the cash line');
  if (cashHanded < cashNeeded) throw new HttpError(422, `Payments are short by PHP ${((cashNeeded - cashHanded) / 100).toFixed(2)}`);

  let remaining = cashNeeded;
  const rows = lines.map((l) => {
    if (l.method !== 'CASH') return { method: l.method, applied: l.amountCents, tendered: null };
    const applied = Math.min(l.amountCents, remaining);
    remaining -= applied;
    return { method: 'CASH', applied, tendered: l.amountCents };
  }).filter((r) => r.applied > 0 || r.method !== 'CASH');
  return { rows, changeCents: cashHanded - cashNeeded };
}

// Closes the tab: payments are NEW rows, the tab gets its final total, the table becomes free again.
function closeSession(db, rt, user, sessionId, body) {
  const lines = validatePayments(body && body.payments);
  return rt.transaction(db, () => {
    const s = db.prepare(`SELECT s.id, s.status, s.token_id, t.token_number
                            FROM sessions s JOIN tokens t ON t.id = s.token_id
                           WHERE s.id = ? AND s.branch_id = ?`).get(sessionId, branchId(db));
    if (!s) throw new HttpError(404, 'Tab not found');
    if (s.status !== 'OPEN') throw new HttpError(409, 'This tab is already closed');

    const bill = computeBill(db, sessionId);
    const { rows, changeCents } = settle(bill.dueCents, lines);
    const now = nowIso();

    const ins = db.prepare(`INSERT INTO payments (id, branch_id, session_id, method, amount_cents, received_by, created_at, tendered_cents)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const r of rows) {
      const id = newId();
      ins.run(id, branchId(db), sessionId, r.method, r.applied, user.id, now, r.tendered);
      queue(db, 'payment', 'payments', id, 'insert');
    }
    // Freeze the bill: reprints and reports always show what was charged, even if settings change later.
    db.prepare(`UPDATE sessions SET status = 'CLOSED', total_cents = ?, subtotal_cents = ?, discount_cents = ?, fee_cents = ?,
                       vat_cents = ?, vatable_sales_cents = ?, vat_exempt_sales_cents = ?, bill_json = ?,
                       closed_by = ?, closed_at = ?, bill_requested_at = NULL, bill_requested_by = NULL, updated_at = ? WHERE id = ?`)
      .run(bill.totalCents, bill.itemsCents, bill.vatRemovedCents + bill.discountCents, bill.feeChargeCents,
        bill.vatCents, bill.vatableSalesCents, bill.vatExemptSalesCents, JSON.stringify(bill),
        user.id, now, now, sessionId);
    queue(db, 'session', 'sessions', sessionId, 'update');

    rt.emitAfterCommit('all', 'session:closed', { sessionId, tokenNumber: s.token_number });
    rt.emitAfterCommit('all', 'token:changed', { tokenId: s.token_id, status: 'FREE', sessionId: null });
    return {
      success: true, totalCents: bill.totalCents, creditCents: bill.creditCents, dueCents: bill.dueCents, changeCents,
      payments: rows.map((r) => ({ method: r.method, amountCents: r.applied, tenderedCents: r.tendered })),
    };
  });
}

// Close, then print the receipt. Nothing sold (everything voided) means nothing to print.
// A printing problem never undoes the sale: the result says whether it printed.
async function finishCheckout(db, rt, user, sessionId, body) {
  const result = closeSession(db, rt, user, sessionId, body);
  if (result.totalCents === 0) return { ...result, printed: false, skipped: true };
  return { ...result, ...(await printDocument(db, 'RECEIPT', sessionId)) };
}

module.exports = { closeSession, finishCheckout, settle };
