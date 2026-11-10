const { buildDocument } = require('../printing/receiptBuilder');
const { Receipt, php } = require('../printing/escpos');
const fs = require('fs');
const path = require('path');
const { sendTcp, sendSpooler } = require('../printing/transports');
const { escposToText } = require('../printing/textPreview');
const { getPrintSettings } = require('./settings');
const { billOf } = require('./totals');
const { HttpError } = require('./errors');
const log = require('../log');

// 'file' = no printer yet: each receipt is saved as readable text in the data folder (for testing).
let receiptsDir = null;
const setReceiptsDir = (dir) => { receiptsDir = dir; };
let fileCounter = 0;

// Returns the file path for 'file', nothing for real printers. Throws when it cannot print.
async function send(settings, bytes) {
  if (settings.transport === 'file') {
    if (!receiptsDir) throw new Error('No folder for saved receipts');
    fs.mkdirSync(receiptsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\..*$/, '');
    const file = path.join(receiptsDir, `receipt-${stamp}-${String(++fileCounter).padStart(3, '0')}.txt`);
    fs.writeFileSync(file, escposToText(bytes, settings.width), 'utf8');
    return file;
  }
  if (settings.transport === 'tcp') return sendTcp({ host: settings.host, port: settings.port }, bytes);
  if (settings.transport === 'spooler') return sendSpooler({ printer: settings.printer }, bytes);
  throw new Error('No printer is set up yet (a manager can set it up in Settings)');
}

function loadData(db, sessionId) {
  const s = db.prepare(`
    SELECT s.id, s.status, s.closed_at, s.customer_name, s.order_source, t.token_number, t.zone, uo.display_name AS opened_by, uc.display_name AS closed_by
      FROM sessions s JOIN tokens t ON t.id = s.token_id
      LEFT JOIN users uo ON uo.id = s.opened_by LEFT JOIN users uc ON uc.id = s.closed_by
     WHERE s.id = ?`).get(sessionId);
  if (!s) throw new HttpError(404, 'Tab not found');
  const items = db.prepare(`
    SELECT n.item_name AS name, SUM(n.net_quantity) AS quantity, SUM(n.net_amount_cents) AS amount_cents
      FROM order_batches b
      JOIN order_items oi ON oi.batch_id = b.id
      JOIN v_order_items_net n ON n.id = oi.id
     WHERE b.session_id = ? AND b.status != 'CANCELLED'
     GROUP BY n.item_name, n.unit_price_cents
    HAVING SUM(n.net_quantity) > 0
     ORDER BY MIN(oi.rowid)`).all(sessionId).map((r) => ({ name: r.name, quantity: r.quantity, amountCents: r.amount_cents }));
  const payments = db.prepare('SELECT method, amount_cents, tendered_cents FROM payments WHERE session_id = ? ORDER BY rowid').all(sessionId)
    .map((p) => ({ method: p.method, amountCents: p.amount_cents, tenderedCents: p.tendered_cents }));
  const changeCents = payments.reduce((n, p) => n + (p.method === 'CASH' && p.tenderedCents ? p.tenderedCents - p.amountCents : 0), 0);
  return {
    session: { tokenNumber: s.token_number, zone: s.zone, openedBy: s.opened_by, closedAt: s.closed_at, customerName: s.customer_name, orderSource: s.order_source },
    items, payments, changeCents, cashier: s.closed_by, bill: billOf(db, sessionId),
  };
}

// kind: 'BILL' | 'RECEIPT'. Never throws: printing problems must not undo a sale.
async function printDocument(db, kind, sessionId) {
  try {
    const settings = getPrintSettings(db);
    const d = loadData(db, sessionId);
    const openDrawer = kind === 'RECEIPT' && settings.drawer && d.payments.some((p) => p.method === 'CASH');
    const savedTo = await send(settings, buildDocument({ settings, kind, d, openDrawer }));
    return savedTo ? { printed: true, savedTo } : { printed: true };
  } catch (e) {
    log.warn(`print failed (${kind}): ${e.message}`);
    return { printed: false, error: String(e.message) };
  }
}

async function printTest(db) {
  const settings = getPrintSettings(db);
  const r = new Receipt(settings.width);
  r.align('center').bold(true).big(true).text(settings.name).big(false).bold(false).text('*** TEST PRINT ***').align('left').line();
  r.row('Printer type', settings.transport).row('Sample line', php(12345)).line().align('center').text(settings.footer).feed(3).cut();
  const savedTo = await send(settings, r.toBuffer());
  return savedTo ? { printed: true, savedTo } : { printed: true };
}

module.exports = { printDocument, printTest, setReceiptsDir };
