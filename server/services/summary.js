// Daily summary: everything the manager needs to close a business day, calculated from the sales rows.
const crypto = require('crypto');
const { branchId, newId, nowIso } = require('../db');
const { BUSINESS } = require('../config');
const { businessDate, shiftOf } = require('./businessTime');
const { approve } = require('./approval');
const { queue } = require('./outbox');
const { HttpError } = require('./errors');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const windowDates = (today) => Array.from({ length: BUSINESS.summaryWindowDays }, (_, i) => addDays(today, -i)); // newest first

const bucket = () => ({ tabs: 0, totalCents: 0 });
const add = (b, cents) => { b.tabs += 1; b.totalCents += cents; };

// Calculate one business day (live). Money is integer centavos.
function buildSummary(db, date) {
  const branch = branchId(db);

  // ---- sales: tabs closed on this business day ----
  const closed = db.prepare(`
    SELECT s.id, t.zone, s.order_source, s.closed_at, s.total_cents,
           COALESCE(s.subtotal_cents, s.total_cents) AS subtotal, COALESCE(s.discount_cents, 0) AS discount, COALESCE(s.fee_cents, 0) AS fee,
           COALESCE(s.vat_cents, 0) AS vat, COALESCE(s.vatable_sales_cents, 0) AS vatable, COALESCE(s.vat_exempt_sales_cents, 0) AS exempt,
           COALESCE(json_extract(s.bill_json, '$.creditCents'), 0) AS credit
      FROM sessions s JOIN tokens t ON t.id = s.token_id
     WHERE s.business_date = ? AND s.status = 'CLOSED' AND s.branch_id = ?`).all(date, branch);

  const sales = {
    tabs: closed.length, itemsCents: 0, discountsCents: 0, feesCents: 0, totalCents: 0, creditsCents: 0,
    byZone: { RESTAURANT: bucket(), BAR: bucket(), TAKEOUT: bucket() }, byShift: { AM: bucket(), PM: bucket() },
    takeouts: { LOCAL: bucket(), ONLINE: bucket() },
  };
  const vat = { vatableSalesCents: 0, vatCents: 0, vatExemptSalesCents: 0 };
  for (const c of closed) {
    sales.itemsCents += c.subtotal; sales.discountsCents += c.discount; sales.feesCents += c.fee;
    sales.totalCents += c.total_cents; sales.creditsCents += c.credit;
    add(sales.byZone[c.zone], c.total_cents);
    add(sales.byShift[shiftOf(new Date(c.closed_at))], c.total_cents);
    if (c.zone === 'TAKEOUT' && sales.takeouts[c.order_source]) add(sales.takeouts[c.order_source], c.total_cents);
    vat.vatableSalesCents += c.vatable; vat.vatCents += c.vat; vat.vatExemptSalesCents += c.exempt;
  }

  // ---- payments received for those tabs ----
  const pays = db.prepare(`
    SELECT p.method, p.amount_cents, p.tendered_cents, p.created_at
      FROM payments p JOIN sessions s ON s.id = p.session_id
     WHERE s.business_date = ? AND s.status = 'CLOSED' AND s.branch_id = ?`).all(date, branch);
  const methods = {};
  const cash = { amountCents: 0, handedCents: 0, changeCents: 0, byShift: { AM: 0, PM: 0 } };
  let paymentsTotal = 0;
  for (const p of pays) {
    methods[p.method] = methods[p.method] || { method: p.method, count: 0, amountCents: 0 };
    methods[p.method].count += 1; methods[p.method].amountCents += p.amount_cents;
    paymentsTotal += p.amount_cents;
    if (p.method === 'CASH') {
      cash.amountCents += p.amount_cents;
      cash.handedCents += p.tendered_cents || p.amount_cents;
      cash.changeCents += (p.tendered_cents || p.amount_cents) - p.amount_cents;
      cash.byShift[shiftOf(new Date(p.created_at))] += p.amount_cents;
    }
  }
  const expected = sales.totalCents - sales.creditsCents; // what customers had to pay (prepaid deposits are credits)
  const payments = {
    byMethod: ['CASH', 'GCASH', 'CARD', 'OTHER'].filter((m) => methods[m]).map((m) => methods[m]),
    totalCents: paymentsTotal, cash, expectedCents: expected, varianceCents: expected - paymentsTotal, // should always be 0
  };

  // ---- voids (all tabs of this business day, including cancelled takeouts) ----
  const voidRows = db.prepare(`
    SELECT v.quantity, v.amount_cents, v.reason, v.shift
      FROM voids v JOIN order_items oi ON oi.id = v.order_item_id JOIN order_batches b ON b.id = oi.batch_id JOIN sessions s ON s.id = b.session_id
     WHERE s.business_date = ? AND s.branch_id = ?`).all(date, branch);
  const voids = { count: voidRows.length, quantity: 0, amountCents: 0, byShift: { AM: { count: 0, amountCents: 0 }, PM: { count: 0, amountCents: 0 } }, byReason: [] };
  const reasons = new Map();
  for (const v of voidRows) {
    voids.quantity += v.quantity; voids.amountCents += v.amount_cents;
    const sh = voids.byShift[v.shift] || voids.byShift.AM; sh.count += 1; sh.amountCents += v.amount_cents;
    const key = v.reason.startsWith('Takeout cancelled') ? 'Takeout cancelled' : v.reason;
    const r = reasons.get(key) || { reason: key, count: 0, amountCents: 0 };
    r.count += 1; r.amountCents += v.amount_cents; reasons.set(key, r);
  }
  voids.byReason = [...reasons.values()].sort((a, b) => b.amountCents - a.amountCents);

  // ---- discounts actually applied on closed tabs (VAT exemption + discount) ----
  const discounts = db.prepare(`
    SELECT d.kind, COUNT(*) AS count,
           COALESCE(SUM(COALESCE(json_extract(s.bill_json, '$.discountCents'), 0) + COALESCE(json_extract(s.bill_json, '$.vatRemovedCents'), 0)), 0) AS amount
      FROM session_discounts d JOIN sessions s ON s.id = d.session_id
     WHERE d.removed_at IS NULL AND s.status = 'CLOSED' AND s.business_date = ? AND s.branch_id = ?
     GROUP BY d.kind ORDER BY d.kind`).all(date, branch).map((r) => ({ kind: r.kind, count: r.count, amountCents: r.amount }));

  // ---- cancelled takeouts / reservations, swaps ----
  const cancelledTakeouts = {
    count: db.prepare(`SELECT COUNT(*) FROM sessions s JOIN tokens t ON t.id = s.token_id WHERE s.status = 'CANCELLED' AND t.zone = 'TAKEOUT' AND s.business_date = ? AND s.branch_id = ?`).pluck().get(date, branch),
    amountCents: voidRows.filter((v) => v.reason.startsWith('Takeout cancelled')).reduce((n, v) => n + v.amount_cents, 0),
  };
  const cancelledReservations = db.prepare(`SELECT COUNT(*) FROM sessions s JOIN tokens t ON t.id = s.token_id
                                             WHERE s.status = 'CANCELLED' AND s.reservation_time IS NOT NULL AND t.zone != 'TAKEOUT' AND s.business_date = ? AND s.branch_id = ?`).pluck().get(date, branch);
  const sw = db.prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(t.quantity), 0) AS q FROM item_transfers t JOIN sessions s ON s.id = t.from_session_id WHERE s.business_date = ? AND s.branch_id = ?`).get(date, branch);

  // ---- items sold (before discounts) ----
  const items = db.prepare(`
    SELECT n.item_name AS name, SUM(n.net_quantity) AS quantity, SUM(n.net_amount_cents) AS amount
      FROM sessions s JOIN order_batches b ON b.session_id = s.id JOIN order_items oi ON oi.batch_id = b.id JOIN v_order_items_net n ON n.id = oi.id
     WHERE s.business_date = ? AND s.status = 'CLOSED' AND s.branch_id = ? AND b.status != 'CANCELLED'
     GROUP BY n.item_name, n.unit_price_cents HAVING SUM(n.net_quantity) > 0 ORDER BY amount DESC, name`).all(date, branch)
    .map((r) => ({ name: r.name, quantity: r.quantity, amountCents: r.amount }));

  // ---- tabs still open that belong to this business day (the day cannot be fully closed yet) ----
  const openTokens = db.prepare(`SELECT t.token_number FROM sessions s JOIN tokens t ON t.id = s.token_id
                                  WHERE s.status = 'OPEN' AND s.business_date = ? AND s.branch_id = ? ORDER BY t.token_number`).pluck().all(date, branch);

  return {
    businessDate: date, windowDays: BUSINESS.summaryWindowDays, sales, vat, payments, voids, discounts,
    cancelledTakeouts, cancelledReservations, swaps: { count: sw.c, quantity: sw.q }, items, openTabs: { count: openTokens.length, tokens: openTokens },
  };
}

const hashOf = (data) => crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');

// Keep the stored copies for the last 10 business days up to date. Finished days are queued for HQ (outbox) whenever
// they are created or their numbers change; older copies are deleted locally (HQ keeps them).
function refreshSummaries(db, now = new Date()) {
  const branch = branchId(db);
  const today = businessDate(now);
  const dates = windowDates(today);
  for (const date of dates) {
    if (!db.prepare('SELECT 1 FROM sessions WHERE business_date = ? AND branch_id = ? LIMIT 1').get(date, branch)) continue;
    const data = buildSummary(db, date);
    const hash = hashOf(data);
    const finalized = date < today ? 1 : 0;
    const row = db.prepare('SELECT revision, hash, finalized FROM daily_summaries WHERE business_date = ?').get(date);
    const stamp = nowIso();
    db.transaction(() => {
      if (!row) {
        db.prepare('INSERT INTO daily_summaries (id, branch_id, business_date, revision, data_json, hash, finalized, generated_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)')
          .run(date, branch, date, JSON.stringify(data), hash, finalized, stamp, stamp);
        if (finalized) queue(db, 'daily_summary', 'daily_summaries', date, 'insert');
      } else if (row.hash !== hash || row.finalized !== finalized) {
        db.prepare('UPDATE daily_summaries SET revision = revision + 1, data_json = ?, hash = ?, finalized = ?, generated_at = ?, updated_at = ? WHERE business_date = ?')
          .run(JSON.stringify(data), hash, finalized, stamp, stamp, date);
        if (finalized) queue(db, 'daily_summary', 'daily_summaries', date, 'update');
      }
    })();
  }
  db.prepare('DELETE FROM daily_summaries WHERE business_date < ?').run(dates[dates.length - 1]);
}

function checkDate(date, now = new Date()) {
  if (typeof date !== 'string' || !DATE_RE.test(date)) throw new HttpError(400, 'Choose a valid date');
  if (!windowDates(businessDate(now)).includes(date))
    throw new HttpError(404, `This system keeps summaries for the last ${BUSINESS.summaryWindowDays} business days. Older ones are kept at HQ.`);
  return date;
}

// The days that have a summary, newest first, with the headline numbers.
function listSummaries(db) {
  refreshSummaries(db);
  const today = businessDate(new Date());
  return db.prepare('SELECT business_date, revision, finalized, data_json FROM daily_summaries ORDER BY business_date DESC').all().map((r) => {
    const d = JSON.parse(r.data_json);
    return { date: r.business_date, finalized: !!r.finalized, isToday: r.business_date === today, revision: r.revision,
      tabs: d.sales.tabs, totalCents: d.sales.totalCents, openTabs: d.openTabs.count, varianceCents: d.payments.varianceCents };
  });
}

function getSummary(db, date) {
  checkDate(date);
  const data = buildSummary(db, date); // always live, so what you see is never stale
  return { ...data, generatedAt: nowIso(), finalized: date < businessDate(new Date()) };
}

// ---------------- export (manager PIN required) ----------------
const peso = (c) => (c / 100).toFixed(2);
const csvCell = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

// Long ("tidy") format: one line per figure, so it opens cleanly in Excel and can be pivoted or imported.
function toCsv(summaries) {
  const rows = [['business_date', 'section', 'name', 'quantity', 'amount_php']];
  for (const s of summaries) {
    const d = s.businessDate;
    const r = (section, name, quantity, cents) => rows.push([d, section, name, quantity ?? '', cents === undefined ? '' : peso(cents)]);
    r('SALES', 'Tabs closed', s.sales.tabs);
    r('SALES', 'Items total (before discounts)', '', s.sales.itemsCents);
    r('SALES', 'Discounts and VAT exemption (less)', '', s.sales.discountsCents);
    r('SALES', 'Reservation fees charged', '', s.sales.feesCents);
    r('SALES', 'TOTAL SALES', s.sales.tabs, s.sales.totalCents);
    r('SALES', 'Prepaid reservation deposits (credited)', '', s.sales.creditsCents);
    for (const [z, b] of Object.entries(s.sales.byZone)) r('ZONE', z, b.tabs, b.totalCents);
    for (const [sh, b] of Object.entries(s.sales.byShift)) r('SHIFT', sh, b.tabs, b.totalCents);
    for (const [src, b] of Object.entries(s.sales.takeouts)) r('TAKEOUT', src, b.tabs, b.totalCents);
    r('VAT', 'VATable sales', '', s.vat.vatableSalesCents); r('VAT', 'VAT', '', s.vat.vatCents); r('VAT', 'VAT-exempt sales', '', s.vat.vatExemptSalesCents);
    for (const m of s.payments.byMethod) r('PAYMENT', m.method, m.count, m.amountCents);
    r('PAYMENT', 'TOTAL PAYMENTS', '', s.payments.totalCents);
    r('CASH', 'Cash expected in drawer', '', s.payments.cash.amountCents);
    r('CASH', 'Cash handed over by customers', '', s.payments.cash.handedCents);
    r('CASH', 'Change given', '', s.payments.cash.changeCents);
    r('CASH', 'Cash received AM shift', '', s.payments.cash.byShift.AM);
    r('CASH', 'Cash received PM shift', '', s.payments.cash.byShift.PM);
    r('CHECK', 'Variance (should be 0.00)', '', s.payments.varianceCents);
    r('VOID', 'All voids', s.voids.count, s.voids.amountCents);
    for (const [sh, b] of Object.entries(s.voids.byShift)) r('VOID_SHIFT', sh, b.count, b.amountCents);
    for (const x of s.voids.byReason) r('VOID_REASON', x.reason, x.count, x.amountCents);
    for (const x of s.discounts) r('DISCOUNT', x.kind, x.count, x.amountCents);
    r('CANCELLED', 'Takeouts cancelled', s.cancelledTakeouts.count, s.cancelledTakeouts.amountCents);
    r('CANCELLED', 'Reservations cancelled', s.cancelledReservations);
    r('SWAPS', 'Items moved between tables', s.swaps.quantity);
    for (const i of s.items) r('ITEM', i.name, i.quantity, i.amountCents);
    r('OPEN_TABS', s.openTabs.tokens.join(' ') || 'none', s.openTabs.count);
  }
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'; // BOM so Excel shows text correctly
}

// Only a MANAGER's approval PIN unlocks an export (a Lead Cashier's PIN is not enough).
function exportSummaries(db, user, body) {
  const b = body || {};
  if (!Array.isArray(b.dates) || b.dates.length < 1 || b.dates.length > BUSINESS.summaryWindowDays) throw new HttpError(400, 'Choose the days to export');
  const dates = [...new Set(b.dates)].map((d) => checkDate(d)).sort();
  const format = b.format === 'json' ? 'json' : 'csv';
  const approver = approve(db, user, b.approvalPin);
  if (approver.role !== 'MANAGER') throw new HttpError(403, 'A manager PIN is needed to export');
  const summaries = dates.map((d) => ({ ...buildSummary(db, d), generatedAt: nowIso() }));
  db.prepare('INSERT INTO summary_exports (id, branch_id, exported_by, approved_by, dates, format) VALUES (?, ?, ?, ?, ?, ?)')
    .run(newId(), branchId(db), user.id, approver.id, dates.join(','), format);
  const name = dates.length === 1 ? dates[0] : `${dates[0]}_to_${dates[dates.length - 1]}`;
  return format === 'json'
    ? { success: true, filename: `daily-summary-${name}.json`, contentType: 'application/json', content: JSON.stringify(summaries, null, 2) }
    : { success: true, filename: `daily-summary-${name}.csv`, contentType: 'text/csv;charset=utf-8', content: toCsv(summaries) };
}

module.exports = { buildSummary, refreshSummaries, listSummaries, getSummary, exportSummaries, toCsv, windowDates, addDays };
